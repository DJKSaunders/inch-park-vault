#!/usr/bin/env python3
"""Cache and parse public Edinburgh South CC scorecards.

The current club-records export remains authoritative. This script writes a
separate enrichment dataset and reports any differences instead of modifying
``public/data/records.json``.

The default command runs a representative five-season pilot:

    python3 scripts/scrape_scorecards.py

Use ``--all-seasons --sample-per-season 0`` for a complete archive run after
the pilot reports have been reviewed.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import http.cookiejar
import json
import re
import time
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener


BASE_URL = "https://www.edinburghsouthcc.org"
FIXTURES_URL = f"{BASE_URL}/fixtures/teamid_1516/1st-XI.aspx"
TEAM_SELECT_ID = "Aspcontent1_ctl00_RadToolBar1_i0_ddTeams"
SEASON_SELECT_ID = "Aspcontent1_ctl00_RadToolBar1_i1_ddSeasons"
DEFAULT_SEASONS = [2004, 2010, 2016, 2022, 2026]
DEFAULT_SAMPLE_SIZE = 5
USER_AGENT = (
    "InchParkVaultDataPilot/1.0 "
    "(public club archive enrichment; cached, rate-limited requests)"
)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value).replace("\xa0", " ")).strip()


def integer(value: str | None) -> int | None:
    if value is None:
        return None
    match = re.search(r"-?\d+", clean_text(value))
    return int(match.group()) if match else None


def decimal(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", clean_text(value))
    return float(match.group()) if match else None


def overs_to_balls(value: str | None) -> int | None:
    if not value:
        return None
    match = re.fullmatch(r"\s*(\d+)(?:\.(\d+))?\s*", value)
    if not match:
        return None
    remainder = int(match.group(2) or 0)
    if remainder > 5:
        return None
    return int(match.group(1)) * 6 + remainder


def normalized_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(
        r"\s+\((?:SM'20|SM)\)\s*$", "", value, flags=re.IGNORECASE
    )
    value = value.casefold().replace("’", "'")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


INVALID_PLAYER_NAMES = {"a.n. other", "selected member not found"}


def archive_team(section_team: str) -> str | None:
    match = re.search(
        r"Edinburgh South Cricket Club\s+"
        r"(1st XI|2nd XI|3rd XI|4th XI|5th XI|Mitres|Women(?:'s)?)",
        section_team,
        re.IGNORECASE,
    )
    if not match:
        return None
    team = match.group(1)
    return "Women's" if team.casefold().startswith("women") else team


def match_opposition(match: dict[str, Any]) -> str | None:
    for team in match.get("teams", []):
        if "Edinburgh South Cricket Club" not in team:
            return team
    return None


@dataclass
class Cell:
    text: str
    member_id: str | None = None


@dataclass
class RawTable:
    section: str
    table_id: str
    headers: list[str] = field(default_factory=list)
    body: list[list[Cell]] = field(default_factory=list)
    footer: list[list[Cell]] = field(default_factory=list)


class ScorecardHTMLParser(HTMLParser):
    """Small purpose-built parser for the server-rendered scorecard tables."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.result_heading = ""
        self.current_section = ""
        self.tables: list[RawTable] = []
        self._capture_tag: str | None = None
        self._capture_parts: list[str] = []
        self._in_result_heading = False
        self._table: RawTable | None = None
        self._table_part = "body"
        self._row: list[Cell] | None = None
        self._cell_parts: list[str] | None = None
        self._cell_member_id: str | None = None

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attr = dict(attrs)
        if tag in {"title", "legend", "h3"}:
            self._capture_tag = tag
            self._capture_parts = []
        elif tag == "h2" and "result" in (attr.get("class") or "").split():
            self._capture_tag = tag
            self._capture_parts = []
            self._in_result_heading = True
        elif tag == "br" and self._capture_tag:
            self._capture_parts.append("\n")

        if tag == "table":
            self._table = RawTable(
                section=self.current_section,
                table_id=attr.get("id") or "",
            )
            self._table_part = "body"
        elif self._table:
            if tag in {"thead", "tbody", "tfoot"}:
                self._table_part = {
                    "thead": "headers",
                    "tbody": "body",
                    "tfoot": "footer",
                }[tag]
            elif tag == "tr":
                self._row = []
            elif tag in {"th", "td"} and self._row is not None:
                self._cell_parts = []
                self._cell_member_id = None
            elif tag == "br" and self._cell_parts is not None:
                self._cell_parts.append(" ")
            elif tag == "div" and self._cell_parts is not None:
                self._cell_parts.append(" ")
            elif tag == "a" and self._cell_parts is not None:
                href = attr.get("href") or ""
                match = re.search(r"/memberprofile/memberID_(\d+)/", href, re.I)
                if match:
                    self._cell_member_id = match.group(1)

    def handle_data(self, data: str) -> None:
        if self._capture_tag:
            self._capture_parts.append(data)
        if self._cell_parts is not None:
            self._cell_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "div" and self._cell_parts is not None:
            self._cell_parts.append(" ")

        if tag in {"title", "legend", "h3", "h2"} and tag == self._capture_tag:
            captured = clean_text("".join(self._capture_parts))
            if tag == "title":
                self.title = captured
            elif tag == "h2" and self._in_result_heading:
                self.result_heading = clean_text(
                    " ".join("".join(self._capture_parts).splitlines())
                )
                self._in_result_heading = False
            elif captured:
                self.current_section = captured
            self._capture_tag = None
            self._capture_parts = []

        if not self._table:
            return
        if tag in {"th", "td"} and self._cell_parts is not None:
            assert self._row is not None
            self._row.append(
                Cell(clean_text("".join(self._cell_parts)), self._cell_member_id)
            )
            self._cell_parts = None
            self._cell_member_id = None
        elif tag == "tr" and self._row is not None:
            if self._table_part == "headers":
                self._table.headers = [cell.text for cell in self._row]
            elif self._table_part == "footer":
                self._table.footer.append(self._row)
            else:
                self._table.body.append(self._row)
            self._row = None
        elif tag == "table":
            self.tables.append(self._table)
            self._table = None


class FixturePageParser(HTMLParser):
    """Extract ASP.NET form state, selectors and scorecard links."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden: dict[str, str] = {}
        self.selects: dict[str, dict[str, Any]] = {}
        self.scorecards: list[dict[str, str]] = []
        self._select_id: str | None = None
        self._option: dict[str, Any] | None = None
        self._option_parts: list[str] = []
        self._anchor_href: str | None = None
        self._anchor_parts: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attr = dict(attrs)
        if tag == "input" and (attr.get("type") or "").casefold() == "hidden":
            name = attr.get("name")
            if name:
                self.hidden[name] = attr.get("value") or ""
        elif tag == "select":
            select_id = attr.get("id")
            if select_id:
                self._select_id = select_id
                self.selects[select_id] = {
                    "name": attr.get("name") or select_id,
                    "options": [],
                    "value": "",
                }
        elif tag == "option" and self._select_id:
            self._option = {
                "value": attr.get("value") or "",
                "selected": "selected" in attr,
            }
            self._option_parts = []
        elif tag == "a":
            href = attr.get("href") or ""
            if re.search(r"/scorecard/fixtureID_\d+/", href, re.I):
                self._anchor_href = urljoin(BASE_URL, href)
                self._anchor_parts = []

    def handle_data(self, data: str) -> None:
        if self._option is not None:
            self._option_parts.append(data)
        if self._anchor_href:
            self._anchor_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "option" and self._select_id and self._option is not None:
            self._option["text"] = clean_text("".join(self._option_parts))
            select = self.selects[self._select_id]
            select["options"].append(self._option)
            if self._option["selected"]:
                select["value"] = self._option["value"]
            self._option = None
            self._option_parts = []
        elif tag == "select":
            self._select_id = None
        elif tag == "a" and self._anchor_href:
            fixture_match = re.search(r"fixtureID_(\d+)", self._anchor_href, re.I)
            self.scorecards.append(
                {
                    "fixtureId": fixture_match.group(1) if fixture_match else "",
                    "url": self._anchor_href,
                    "result": clean_text("".join(self._anchor_parts)),
                }
            )
            self._anchor_href = None
            self._anchor_parts = []


class Fetcher:
    def __init__(self, delay: float, retries: int = 3) -> None:
        jar = http.cookiejar.CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(jar))
        self.delay = max(delay, 0.0)
        self.retries = retries
        self._last_request = 0.0

    def request(self, url: str, data: dict[str, str] | None = None) -> str:
        wait = self.delay - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        payload = urlencode(data).encode() if data is not None else None
        request = Request(url, data=payload, headers={"User-Agent": USER_AGENT})
        for attempt in range(self.retries):
            try:
                with self.opener.open(request, timeout=30) as response:
                    self._last_request = time.monotonic()
                    return response.read().decode(
                        response.headers.get_content_charset() or "utf-8",
                        errors="replace",
                    )
            except (HTTPError, URLError, TimeoutError):
                if attempt + 1 == self.retries:
                    raise
                time.sleep(2 ** attempt)
        raise RuntimeError("unreachable")


def parse_fixture_page(source: str) -> FixturePageParser:
    parser = FixturePageParser()
    parser.feed(source)
    return parser


def postback_fields(
    page: FixturePageParser, target_id: str, value: str
) -> dict[str, str]:
    target = page.selects[target_id]
    fields = dict(page.hidden)
    for select in page.selects.values():
        fields[select["name"]] = select["value"]
    fields[target["name"]] = value
    fields["__EVENTTARGET"] = target["name"]
    fields["__EVENTARGUMENT"] = ""
    return fields


def discover_scorecards(
    fetcher: Fetcher,
    seasons: list[int],
    fixture_cache: Path,
) -> tuple[list[dict[str, str]], dict[int, int]]:
    fixture_cache.mkdir(parents=True, exist_ok=True)
    source = fetcher.request(FIXTURES_URL)
    page = parse_fixture_page(source)

    if TEAM_SELECT_ID not in page.selects or SEASON_SELECT_ID not in page.selects:
        raise RuntimeError("Fixture filters were not found in the source page")

    source = fetcher.request(
        FIXTURES_URL, postback_fields(page, TEAM_SELECT_ID, "all")
    )
    page = parse_fixture_page(source)
    season_values = {
        int(option["text"]): option["value"]
        for option in page.selects[SEASON_SELECT_ID]["options"]
        if option["text"].isdigit()
    }

    missing = sorted(set(seasons) - set(season_values))
    if missing:
        raise RuntimeError(f"Seasons not offered by fixture archive: {missing}")

    discovered: list[dict[str, str]] = []
    coverage: dict[int, int] = {}
    for season in seasons:
        source = fetcher.request(
            FIXTURES_URL,
            postback_fields(page, SEASON_SELECT_ID, season_values[season]),
        )
        page = parse_fixture_page(source)
        (fixture_cache / f"{season}.html").write_text(source, encoding="utf-8")
        unique: dict[str, dict[str, str]] = {}
        for scorecard in page.scorecards:
            unique[scorecard["fixtureId"]] = {**scorecard, "season": season}
        rows = list(unique.values())
        coverage[season] = len(rows)
        discovered.extend(rows)
    return discovered, coverage


def deterministic_sample(
    rows: list[dict[str, str]], per_season: int
) -> list[dict[str, str]]:
    if per_season <= 0:
        return rows
    by_season: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        by_season[int(row["season"])].append(row)
    selected: list[dict[str, str]] = []
    for season in sorted(by_season):
        candidates = by_season[season]
        if len(candidates) <= per_season:
            selected.extend(candidates)
            continue
        indexes = {
            round(index * (len(candidates) - 1) / (per_season - 1))
            for index in range(per_season)
        }
        selected.extend(candidates[index] for index in sorted(indexes))
    return selected


def header_key(value: str, index: int) -> str:
    value = clean_text(value).casefold()
    aliases = {
        "player name": "player",
        "player": "player",
        "r": "runs",
        "runs": "runs",
        "m": "minutes",
        "b": "balls",
        "4s": "fours",
        "6s": "sixes",
        "sr": "strikeRate",
        "ct": "catches",
        "catches": "catches",
        "st": "stumpings",
        "stumpings": "stumpings",
        "ro": "runOuts",
        "run outs": "runOuts",
        "overs": "overs",
        "maidens": "maidens",
        "wickets": "wickets",
        "average": "average",
        "economy": "economy",
    }
    if not value and index == 1:
        return "dismissal"
    return aliases.get(value, value or f"column{index}")


def table_kind(table: RawTable) -> str | None:
    keys = {header_key(value, index) for index, value in enumerate(table.headers)}
    if {"overs", "maidens", "wickets"}.issubset(keys):
        return "bowling"
    if "player" in keys and "runs" in keys and (
        "balls" in keys or "strikeRate" in keys
    ):
        return "batting"
    return None


def row_mapping(headers: list[str], cells: list[Cell]) -> dict[str, Any]:
    mapped: dict[str, Any] = {}
    for index, cell in enumerate(cells):
        header = headers[index] if index < len(headers) else ""
        key = header_key(header, index)
        mapped[key] = cell.text or None
        if index == 0 and cell.member_id:
            mapped["memberId"] = cell.member_id
    return mapped


def parse_total(table: RawTable) -> dict[str, Any] | None:
    if not table.footer:
        return None
    texts = [cell.text for cell in table.footer[0]]
    combined = " ".join(texts)
    wickets_match = re.search(r"for\s+(\d+)\s+wickets?", combined, re.I)
    total_match = re.search(
        r"(\d+)\s*(?:\((\d+(?:\.\d+)?)\s+overs?\))?\s*$",
        texts[2] if len(texts) > 2 else combined,
        re.I,
    )
    extras = {}
    for value, kind in re.findall(r"(\d+)\s*(nb|lb|w|b|p)\b", combined, re.I):
        extras[kind.casefold()] = int(value)
    return {
        "runs": int(total_match.group(1)) if total_match else None,
        "wickets": int(wickets_match.group(1)) if wickets_match else None,
        "overs": total_match.group(2) if total_match else None,
        "extras": extras,
        "raw": combined,
    }


def parse_batting(table: RawTable) -> dict[str, Any]:
    players = []
    for cells in table.body:
        mapped = row_mapping(table.headers, cells)
        player = clean_text(mapped.get("player") or "")
        if not player or player.casefold() == "no records to display.":
            continue
        dismissal = clean_text(mapped.get("dismissal") or "")
        players.append(
            {
                "player": player,
                "memberId": mapped.get("memberId"),
                "dismissal": dismissal or None,
                "notOut": bool(re.search(r"\bnot out\b|\bno\b", dismissal, re.I)),
                "didNotBat": mapped.get("runs") in (None, "", "-"),
                "runs": integer(mapped.get("runs")),
                "minutes": integer(mapped.get("minutes")),
                "balls": integer(mapped.get("balls")),
                "fours": integer(mapped.get("fours")),
                "sixes": integer(mapped.get("sixes")),
                "strikeRate": decimal(mapped.get("strikeRate")),
                "catches": integer(mapped.get("catches")),
                "stumpings": integer(mapped.get("stumpings")),
                "runOuts": integer(mapped.get("runOuts")),
            }
        )
    return {
        "team": re.sub(r"\s+Batting\s*$", "", table.section, flags=re.I),
        "total": parse_total(table),
        "players": players,
    }


def parse_bowling(table: RawTable) -> dict[str, Any]:
    players = []
    for cells in table.body:
        mapped = row_mapping(table.headers, cells)
        player = clean_text(mapped.get("player") or "")
        if not player or player.casefold() == "no records to display.":
            continue
        overs = mapped.get("overs")
        players.append(
            {
                "player": player,
                "memberId": mapped.get("memberId"),
                "overs": overs,
                "balls": overs_to_balls(overs),
                "maidens": integer(mapped.get("maidens")),
                "runs": integer(mapped.get("runs")),
                "wickets": integer(mapped.get("wickets")),
                "average": decimal(mapped.get("average")),
                "economy": decimal(mapped.get("economy")),
            }
        )
    return {
        "team": re.sub(r"\s+Bowling\s*$", "", table.section, flags=re.I),
        "players": players,
    }


def parse_match_metadata(
    fixture_id: str, source_url: str, parser: ScorecardHTMLParser
) -> dict[str, Any]:
    title = parser.title
    date_match = re.search(
        r"\bon\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+"
        r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b",
        title,
    )
    record_date = None
    if date_match:
        record_date = datetime.strptime(
            date_match.group(1), "%d %b %Y"
        ).date().isoformat()
    teams_match = re.match(r"(.+?)\s+v\s+(.+?)\s+on\s+", title)
    heading = parser.result_heading
    result_text = heading
    if title and heading.startswith(title):
        result_text = clean_text(heading[len(title) :])
    outcome = "unknown"
    for label, pattern in (
        ("concession", r"\bconcession\b|\bconced"),
        ("win", r"\bWon\b"),
        ("loss", r"\bLost\b"),
        ("tie", r"\bTied\b"),
        ("draw", r"\bDrawn\b|\bDraw\b"),
        ("abandoned", r"\bAbandoned\b"),
        ("cancelled", r"\bCancelled\b"),
    ):
        if re.search(pattern, result_text, re.I):
            outcome = label
            break
    return {
        "fixtureId": fixture_id,
        "sourceUrl": source_url,
        "title": title,
        "date": record_date,
        "season": int(record_date[:4]) if record_date else None,
        "teams": list(teams_match.groups()) if teams_match else [],
        "result": {"summary": result_text or None, "outcome": outcome},
    }


def parse_scorecard(
    fixture_id: str, source_url: str, source: str
) -> dict[str, Any]:
    parser = ScorecardHTMLParser()
    parser.feed(source)
    match = parse_match_metadata(fixture_id, source_url, parser)
    batting = []
    bowling = []
    warnings = []
    for table in parser.tables:
        kind = table_kind(table)
        if kind == "batting":
            batting.append(parse_batting(table))
        elif kind == "bowling":
            bowling.append(parse_bowling(table))
    if not batting:
        warnings.append("No batting tables parsed")
    if not bowling:
        warnings.append("No bowling tables parsed")
    match.update(
        {
            "batting": batting,
            "bowling": bowling,
            "parseWarnings": warnings,
            "sourceSha256": hashlib.sha256(source.encode()).hexdigest(),
        }
    )
    return match


def fetch_scorecards(
    fetcher: Fetcher,
    manifest: list[dict[str, str]],
    scorecard_cache: Path,
    quiet: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    scorecard_cache.mkdir(parents=True, exist_ok=True)
    parsed = []
    failures = []
    for index, row in enumerate(manifest, start=1):
        cache_path = scorecard_cache / f"{row['fixtureId']}.html"
        try:
            if cache_path.exists():
                source = cache_path.read_text(encoding="utf-8")
            else:
                source = fetcher.request(row["url"])
                cache_path.write_text(source, encoding="utf-8")
            parsed.append(parse_scorecard(row["fixtureId"], row["url"], source))
            if not quiet:
                print(
                    f"[{index}/{len(manifest)}] parsed fixture {row['fixtureId']}",
                    flush=True,
                )
        except Exception as error:  # retain the rest of a long crawl
            failures.append(
                {
                    "fixtureId": row["fixtureId"],
                    "url": row["url"],
                    "error": f"{type(error).__name__}: {error}",
                }
            )
    return parsed, failures


def iter_escc_players(matches: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for match in matches:
        opposition = match_opposition(match)
        for discipline in ("batting", "bowling"):
            for section in match[discipline]:
                team = archive_team(section["team"])
                if not team:
                    continue
                for player in section["players"]:
                    yield {
                        **player,
                        "discipline": discipline,
                        "team": team,
                        "opposition": opposition,
                        "date": match["date"],
                        "fixtureId": match["fixtureId"],
                    }


def build_player_report(
    matches: list[dict[str, Any]], records: dict[str, Any]
) -> dict[str, Any]:
    archive_names = records["meta"]["playerNames"]
    normalized_archive: dict[str, list[str]] = defaultdict(list)
    for name in archive_names:
        normalized_archive[normalized_name(name)].append(name)

    scraped: dict[str, dict[str, Any]] = {}
    invalid_source_rows = []
    for row in iter_escc_players(matches):
        name = row["player"]
        if normalized_name(name) in INVALID_PLAYER_NAMES:
            invalid_source_rows.append(
                {
                    "fixtureId": row["fixtureId"],
                    "date": row["date"],
                    "team": row["team"],
                    "player": name,
                }
            )
            continue
        entry = scraped.setdefault(
            normalized_name(name),
            {"scrapedName": name, "memberIds": set(), "appearances": 0},
        )
        if row.get("memberId"):
            entry["memberIds"].add(row["memberId"])
        entry["appearances"] += 1

    matched = []
    ambiguous = []
    unmatched = []
    for key, entry in sorted(scraped.items()):
        candidates = normalized_archive.get(key, [])
        output = {
            **entry,
            "memberIds": sorted(entry["memberIds"]),
            "archiveCandidates": candidates,
        }
        if len(candidates) == 1:
            matched.append(output)
        elif len(candidates) > 1:
            ambiguous.append(output)
        else:
            unmatched.append(output)
    return {
        "summary": {
            "uniqueScrapedPlayers": len(scraped),
            "matched": len(matched),
            "ambiguous": len(ambiguous),
            "unmatched": len(unmatched),
            "invalidSourceRows": len(invalid_source_rows),
        },
        "matched": matched,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
        "invalidSourceRows": invalid_source_rows,
    }


def indexed_archive_rows(
    records: dict[str, Any],
) -> dict[str, dict[Any, list]]:
    batting = defaultdict(list)
    bowling = defaultdict(list)
    batting_without_opposition = defaultdict(list)
    bowling_without_opposition = defaultdict(list)
    for row in records["batting"]:
        batting[
            (row[5], row[2], normalized_name(row[4]), normalized_name(row[0]))
        ].append(row)
        batting_without_opposition[
            (row[5], row[2], normalized_name(row[0]))
        ].append(row)
    for row in records["bowling"]:
        bowling[
            (row[5], row[2], normalized_name(row[4]), normalized_name(row[0]))
        ].append(row)
        bowling_without_opposition[
            (row[5], row[2], normalized_name(row[0]))
        ].append(row)
    return {
        "batting": batting,
        "bowling": bowling,
        "battingWithoutOpposition": batting_without_opposition,
        "bowlingWithoutOpposition": bowling_without_opposition,
    }


def build_discrepancy_report(
    matches: list[dict[str, Any]], records: dict[str, Any]
) -> dict[str, Any]:
    indexes = indexed_archive_rows(records)
    differences = []
    missing = []
    checked = 0
    for row in iter_escc_players(matches):
        if normalized_name(row["player"]) in INVALID_PLAYER_NAMES:
            continue
        key = (
            row["date"],
            row["team"],
            normalized_name(row.get("opposition") or ""),
            normalized_name(row["player"]),
        )
        index = indexes[row["discipline"]]
        candidates = index.get(key, [])
        if not candidates:
            fallback_key = (
                row["date"],
                row["team"],
                normalized_name(row["player"]),
            )
            fallback = indexes[
                f"{row['discipline']}WithoutOpposition"
            ].get(fallback_key, [])
            if len(fallback) == 1:
                candidates = fallback
        if not candidates:
            missing.append(
                {
                    "fixtureId": row["fixtureId"],
                    "date": row["date"],
                    "team": row["team"],
                    "discipline": row["discipline"],
                    "player": row["player"],
                }
            )
            continue
        archive_row = candidates[0]
        checked += 1
        if row["discipline"] == "batting":
            comparisons = {
                "runs": (row.get("runs"), archive_row[6]),
                "didNotBat": (row.get("didNotBat"), archive_row[8]),
                "catches": (row.get("catches"), archive_row[9]),
                "stumpings": (row.get("stumpings"), archive_row[10]),
                "runOuts": (row.get("runOuts"), archive_row[11]),
            }
            if not row.get("didNotBat") and not archive_row[8]:
                comparisons["notOut"] = (row.get("notOut"), archive_row[7])
        else:
            comparisons = {
                "balls": (row.get("balls"), archive_row[6]),
                "maidens": (row.get("maidens"), archive_row[7]),
                "runs": (row.get("runs"), archive_row[8]),
                "wickets": (row.get("wickets"), archive_row[9]),
            }
        for field_name, (scraped, archived) in comparisons.items():
            if scraped is not None and scraped != archived:
                differences.append(
                    {
                        "fixtureId": row["fixtureId"],
                        "date": row["date"],
                        "team": row["team"],
                        "discipline": row["discipline"],
                        "player": row["player"],
                        "field": field_name,
                        "scraped": scraped,
                        "archive": archived,
                    }
                )
    return {
        "summary": {
            "matchedRowsChecked": checked,
            "differences": len(differences),
            "rowsWithoutArchiveMatch": len(missing),
        },
        "differences": differences,
        "rowsWithoutArchiveMatch": missing,
    }


def build_coverage_report(matches: list[dict[str, Any]]) -> dict[str, Any]:
    by_season: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for match in matches:
        if match.get("season"):
            by_season[int(match["season"])].append(match)
    seasons = {}
    for season, season_matches in sorted(by_season.items()):
        escc_batting = [
            section
            for match in season_matches
            for section in match["batting"]
            if archive_team(section["team"])
        ]
        escc_bowling = [
            section
            for match in season_matches
            for section in match["bowling"]
            if archive_team(section["team"])
        ]
        seasons[str(season)] = {
            "matches": len(season_matches),
            "knownResults": sum(
                match["result"]["outcome"] != "unknown"
                for match in season_matches
            ),
            "matchesWithFourTables": sum(
                len(match["batting"]) >= 2 and len(match["bowling"]) >= 2
                for match in season_matches
            ),
            "inningsTotalsRecorded": sum(
                section.get("total")
                and section["total"].get("runs") is not None
                for match in season_matches
                for section in match["batting"]
            ),
            "esccBattingSections": len(escc_batting),
            "esccBattingWithBalls": sum(
                any(
                    not player["didNotBat"] and player["balls"] is not None
                    for player in section["players"]
                )
                for section in escc_batting
            ),
            "esccBattingWithBoundaries": sum(
                any(
                    not player["didNotBat"]
                    and (
                        player["fours"] is not None
                        or player["sixes"] is not None
                    )
                    for player in section["players"]
                )
                for section in escc_batting
            ),
            "esccBattingWithFielding": sum(
                any(
                    player["catches"] is not None
                    or player["stumpings"] is not None
                    or player["runOuts"] is not None
                    for player in section["players"]
                )
                for section in escc_batting
            ),
            "esccBowlingSections": len(escc_bowling),
            "esccBowlingRows": sum(
                len(section["players"]) for section in escc_bowling
            ),
        }
    return {"seasons": seasons}


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_markdown_report(
    path: Path,
    seasons: list[int],
    discovered_coverage: dict[int, int],
    selected: list[dict[str, str]],
    matches: list[dict[str, Any]],
    failures: list[dict[str, str]],
    player_report: dict[str, Any],
    discrepancy_report: dict[str, Any],
    coverage_report: dict[str, Any],
    purpose: str,
) -> None:
    selected_by_season = Counter(int(row["season"]) for row in selected)
    parsed_by_season = Counter(
        int(match["season"]) for match in matches if match["season"]
    )
    batting_rows = sum(
        len(section["players"])
        for match in matches
        for section in match["batting"]
    )
    bowling_rows = sum(
        len(section["players"])
        for match in matches
        for section in match["bowling"]
    )
    lines = [
        (
            "# Scorecard archive enrichment"
            if purpose == "full scorecard archive enrichment"
            else "# Scorecard enrichment pilot"
        ),
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "The existing club-records JSON was treated as read-only and authoritative.",
        "",
        "## Coverage",
        "",
        "| Season | Discovered scorecards | Selected | Parsed |",
        "| ---: | ---: | ---: | ---: |",
    ]
    for season in seasons:
        lines.append(
            f"| {season} | {discovered_coverage.get(season, 0)} | "
            f"{selected_by_season[season]} | {parsed_by_season[season]} |"
        )
    lines.extend(
        [
            "",
            f"- Parsed matches: **{len(matches)}**",
            f"- Fetch/parse failures: **{len(failures)}**",
            f"- Batting rows retained: **{batting_rows}**",
            f"- Bowling rows retained: **{bowling_rows}**",
            "",
            "## Player matching",
            "",
            f"- Unique ESCC names: **{player_report['summary']['uniqueScrapedPlayers']}**",
            f"- Matched: **{player_report['summary']['matched']}**",
            f"- Ambiguous: **{player_report['summary']['ambiguous']}**",
            f"- Unmatched: **{player_report['summary']['unmatched']}**",
            f"- Invalid source rows: **{player_report['summary']['invalidSourceRows']}**",
            "",
            "## Enrichment coverage",
            "",
            "| Season | ESCC innings | Balls available | Boundaries available | Fielding available |",
            "| ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for season in seasons:
        coverage = coverage_report["seasons"].get(str(season), {})
        lines.append(
            f"| {season} | {coverage.get('esccBattingSections', 0)} | "
            f"{coverage.get('esccBattingWithBalls', 0)} | "
            f"{coverage.get('esccBattingWithBoundaries', 0)} | "
            f"{coverage.get('esccBattingWithFielding', 0)} |"
        )
    lines.extend(
        [
            "",
            "## Archive comparison",
            "",
            f"- Matched rows checked: **{discrepancy_report['summary']['matchedRowsChecked']}**",
            f"- Field differences: **{discrepancy_report['summary']['differences']}**",
            f"- Rows without archive match: **{discrepancy_report['summary']['rowsWithoutArchiveMatch']}**",
            "",
            "See the adjacent JSON reports for row-level detail.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seasons",
        default=",".join(map(str, DEFAULT_SEASONS)),
        help="Comma-separated seasons for the pilot",
    )
    parser.add_argument(
        "--all-seasons",
        action="store_true",
        help="Discover every offered season from 2004 onward",
    )
    parser.add_argument(
        "--sample-per-season",
        type=int,
        default=DEFAULT_SAMPLE_SIZE,
        help="Deterministic sample size; 0 downloads every discovered scorecard",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.8,
        help="Minimum delay between HTTP requests in seconds",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/scorecards/pilot"),
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("data/scorecards/cache"),
    )
    parser.add_argument(
        "--records",
        type=Path,
        default=Path("public/data/records.json"),
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress per-scorecard progress output",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    requested = sorted(
        {
            int(value)
            for value in args.seasons.split(",")
            if value.strip()
        }
    )
    seasons = list(range(2004, datetime.now().year + 1)) if args.all_seasons else requested
    fetcher = Fetcher(args.delay)
    discovered, coverage = discover_scorecards(
        fetcher, seasons, args.cache_dir / "fixtures"
    )
    selected = deterministic_sample(discovered, args.sample_per_season)
    matches, failures = fetch_scorecards(
        fetcher, selected, args.cache_dir / "scorecards", quiet=args.quiet
    )
    records = json.loads(args.records.read_text(encoding="utf-8"))
    player_report = build_player_report(matches, records)
    discrepancy_report = build_discrepancy_report(matches, records)
    coverage_report = build_coverage_report(matches)

    generated = datetime.now(timezone.utc).isoformat()
    purpose = (
        "full scorecard archive enrichment"
        if args.all_seasons and args.sample_per_season <= 0
        else "scorecard enrichment pilot"
    )
    manifest = {
        "meta": {
            "generatedAt": generated,
            "source": BASE_URL,
            "seasons": seasons,
            "samplePerSeason": args.sample_per_season,
            "discoveredScorecards": len(discovered),
            "selectedScorecards": len(selected),
            "purpose": purpose,
        },
        "coverage": {str(year): count for year, count in coverage.items()},
        "scorecards": selected,
    }
    dataset = {
        "meta": {
            "generatedAt": generated,
            "source": BASE_URL,
            "matchCount": len(matches),
            "failureCount": len(failures),
            "authoritative": False,
            "purpose": purpose,
        },
        "matches": matches,
    }
    write_json(args.output_dir / "manifest.json", manifest)
    write_json(args.output_dir / "scorecards.json", dataset)
    write_json(args.output_dir / "failures.json", failures)
    write_json(args.output_dir / "player-matching.json", player_report)
    write_json(args.output_dir / "discrepancies.json", discrepancy_report)
    write_json(args.output_dir / "coverage.json", coverage_report)
    write_markdown_report(
        args.output_dir / "REPORT.md",
        seasons,
        coverage,
        selected,
        matches,
        failures,
        player_report,
        discrepancy_report,
        coverage_report,
        purpose,
    )
    print(
        json.dumps(
            {
                "discovered": len(discovered),
                "selected": len(selected),
                "parsed": len(matches),
                "failures": len(failures),
                "outputDir": str(args.output_dir),
            }
        )
    )


if __name__ == "__main__":
    main()
