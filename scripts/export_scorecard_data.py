#!/usr/bin/env python3
"""Build production-ready Vault datasets from the scraped scorecard archive.

The workbook-derived ``public/data/records.json`` remains authoritative. This
exporter creates a separate, traceable scorecard dataset designed for lazy
loading by fixture and player.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import importlib.util
import json
import re
import shutil
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import date as calendar_date
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
SCRAPER_PATH = ROOT / "scripts" / "scrape_scorecards.py"
COMPETITION_OVERRIDES_PATH = (
    ROOT / "data" / "scorecards" / "competition-overrides.json"
)
SCHEMA_VERSION = "1.0.0"
PLACEHOLDER_NAMES = {
    "a.n. other",
    "fill-in",
    "no player / one off player",
    "selected member not found",
    "tbc",
}
ADMINISTRATIVE_NO_PLAY_RESULT = re.compile(
    r"\b(?:conced(?:e|ed|es|ing)?|concession|forfeit(?:ed)?|walk[\s-]?over)\b",
    flags=re.IGNORECASE,
)
DISMISSAL_CATEGORIES = (
    "caught",
    "bowled",
    "lbw",
    "run-out",
    "stumped",
    "hit-wicket",
    "retired-out",
    "other",
)


def load_scraper_module():
    spec = importlib.util.spec_from_file_location(
        "vault_scorecard_scraper", SCRAPER_PATH
    )
    if not spec or not spec.loader:
        raise RuntimeError(f"Unable to load {SCRAPER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


SCRAPER = load_scraper_module()


def normalized_name(value: str) -> str:
    return SCRAPER.normalized_name(value)


def display_name(value: str) -> str:
    value = re.sub(
        r"\s+\((?:SM'20|SM)\)\s*$", "", value, flags=re.IGNORECASE
    )
    value = re.sub(r"\s+", " ", value).strip()
    return {
        "kiran sv": "Kiran Sankaran",
        "srini m": "Srini Muthuraman",
    }.get(value.casefold(), value)


def is_placeholder(value: str) -> bool:
    return normalized_name(value) in PLACEHOLDER_NAMES


def dismissal_category(dismissal: str | None, not_out: bool) -> str | None:
    """Return a stable batting-dismissal category without parsing participants."""

    if not_out or not dismissal:
        return None
    value = re.sub(r"\s+", " ", dismissal).strip().casefold()
    if re.match(r"^(?:c(?:t|aught)?\b|caught\b)", value):
        return "caught"
    if re.match(r"^(?:b\b|bowled\b)", value):
        return "bowled"
    if re.match(r"^lbw\b", value):
        return "lbw"
    if re.match(r"^run[\s-]?out\b", value):
        return "run-out"
    if re.match(r"^(?:st\b|stumped\b)", value):
        return "stumped"
    if re.match(r"^(?:hit wicket|hit wkt|hw)\b", value):
        return "hit-wicket"
    if re.match(r"^retired(?:\s+out)?\b", value):
        return "retired-out"
    return "other"


def slug(value: str) -> str:
    value = normalized_name(value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:42] or "player"


def canonical_player_id(value: str) -> str:
    identity = normalized_name(value)
    identity = {
        "kiran sankaran": "kiran sv",
        "srini muthuraman": "srini m",
    }.get(identity, identity)
    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:8]
    return f"p-{slug(identity)}-{digest}"


def placeholder_player_id(
    fixture_id: str, innings_number: int, discipline: str, row_number: int
) -> str:
    return (
        f"x-{fixture_id}-{innings_number}-"
        f"{'bat' if discipline == 'batting' else 'bowl'}-{row_number}"
    )


def compact_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def readable_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def competition_lookup(
    records: dict[str, Any],
) -> tuple[dict[tuple[str, str, str], set[str]], dict[tuple[str, str], set[str]]]:
    exact: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    fallback: dict[tuple[str, str], set[str]] = defaultdict(set)
    for discipline in ("batting", "bowling"):
        for row in records[discipline]:
            date, team, opposition, competition = row[5], row[2], row[4], row[3]
            exact[(date, team, normalized_name(opposition))].add(competition)
            fallback[(date, team)].add(competition)
    return exact, fallback


def competition_for_match(
    match: dict[str, Any],
    exact: dict[tuple[str, str, str], set[str]],
    fallback: dict[tuple[str, str], set[str]],
) -> tuple[str | None, str]:
    team = next(
        (
            SCRAPER.archive_team(section["team"])
            for section in match["batting"]
            if SCRAPER.archive_team(section["team"])
        ),
        None,
    )
    opposition = SCRAPER.match_opposition(match)
    if not team:
        return None, "missing-escc-team"
    candidates = exact.get(
        (match["date"], team, normalized_name(opposition or "")), set()
    )
    if len(candidates) == 1:
        return next(iter(candidates)), "exact"
    fallback_candidates = fallback.get((match["date"], team), set())
    if not candidates and len(fallback_candidates) == 1:
        return next(iter(fallback_candidates)), "date-team"
    return None, "ambiguous" if candidates or fallback_candidates else "missing"


def normalize_total(total: dict[str, Any] | None) -> dict[str, Any] | None:
    if not total:
        return None
    return {
        "runs": total.get("runs"),
        "wickets": total.get("wickets"),
        "overs": total.get("overs"),
        "extras": total.get("extras") or {},
    }


def overs_from_bowling(rows: list[dict[str, Any]]) -> str | None:
    """Calculate cricket overs from a complete set of bowling ball counts."""

    if not rows or any(row.get("balls") is None for row in rows):
        return None
    balls = sum(int(row["balls"]) for row in rows)
    return f"{balls // 6}.{balls % 6}"


def is_unplayed_innings(batting: dict[str, Any] | None) -> bool:
    """Identify empty scorecard templates that do not represent an innings."""

    if not batting:
        return False
    total = batting.get("total") or {}
    players = batting.get("players") or []
    overs = total.get("overs")
    return (
        bool(players)
        and all(player.get("didNotBat") for player in players)
        and (total.get("runs") or 0) == 0
        and (total.get("wickets") or 0) == 0
        and (overs is None or str(overs) in {"0", "0.0"})
    )


def is_administrative_no_play_result(match: dict[str, Any]) -> bool:
    """Identify fixtures awarded without any cricket being played."""

    result = match.get("result") or {}
    return (
        result.get("outcome") in {"concession", "forfeit", "walkover"}
        or bool(ADMINISTRATIVE_NO_PLAY_RESULT.search(result.get("summary") or ""))
    )


def normalize_batting_rows(
    rows: list[dict[str, Any]],
    fixture_id: str,
    innings_number: int,
    quality: dict[str, Any],
) -> list[dict[str, Any]]:
    """Apply the agreed DNB rules within one batting-team innings."""

    named_groups: dict[str, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    placeholders: list[tuple[int, dict[str, Any]]] = []
    for index, row in enumerate(rows, start=1):
        if is_placeholder(row["player"]):
            placeholders.append((index, row))
        else:
            named_groups[normalized_name(row["player"])].append((index, row))

    retained: list[tuple[int, dict[str, Any]]] = list(placeholders)
    for group in named_groups.values():
        genuine = [item for item in group if not item[1].get("didNotBat")]
        dnb = [item for item in group if item[1].get("didNotBat")]
        if genuine:
            retained.extend(genuine)
            for row_number, row in dnb:
                quality["suppressedDnbRows"].append(
                    {
                        "fixtureId": fixture_id,
                        "inningsNumber": innings_number,
                        "player": display_name(row["player"]),
                        "rowNumber": row_number,
                        "reason": "genuine-innings-present",
                    }
                )
        elif dnb:
            retained.append(dnb[0])
            for row_number, row in dnb[1:]:
                quality["collapsedDuplicateDnbRows"].append(
                    {
                        "fixtureId": fixture_id,
                        "inningsNumber": innings_number,
                        "player": display_name(row["player"]),
                        "rowNumber": row_number,
                    }
                )

    output = []
    for original_row_number, row in sorted(retained, key=lambda item: item[0]):
        placeholder = is_placeholder(row["player"])
        player_id = (
            placeholder_player_id(
                fixture_id, innings_number, "batting", original_row_number
            )
            if placeholder
            else canonical_player_id(row["player"])
        )
        output.append(
            {
                "rowNumber": original_row_number,
                "playerId": player_id,
                "player": display_name(row["player"]),
                "memberId": row.get("memberId"),
                "isPlaceholder": placeholder,
                "entryType": (
                    "did-not-bat" if row.get("didNotBat") else "innings"
                ),
                "dismissal": row.get("dismissal"),
                "notOut": bool(row.get("notOut")),
                "runs": row.get("runs"),
                "minutes": row.get("minutes"),
                "balls": row.get("balls"),
                "fours": row.get("fours"),
                "sixes": row.get("sixes"),
                "strikeRate": row.get("strikeRate"),
                "catches": row.get("catches"),
                "stumpings": row.get("stumpings"),
                "runOuts": row.get("runOuts"),
            }
        )
    return output


def normalize_bowling_rows(
    rows: list[dict[str, Any]], fixture_id: str, innings_number: int
) -> list[dict[str, Any]]:
    output = []
    for row_number, row in enumerate(rows, start=1):
        placeholder = is_placeholder(row["player"])
        player_id = (
            placeholder_player_id(
                fixture_id, innings_number, "bowling", row_number
            )
            if placeholder
            else canonical_player_id(row["player"])
        )
        output.append(
            {
                "rowNumber": row_number,
                "playerId": player_id,
                "player": display_name(row["player"]),
                "memberId": row.get("memberId"),
                "isPlaceholder": placeholder,
                "overs": row.get("overs"),
                "balls": row.get("balls"),
                "maidens": row.get("maidens"),
                "runs": row.get("runs"),
                "wickets": row.get("wickets"),
                "average": row.get("average"),
                "economy": row.get("economy"),
            }
        )
    return output


def side_role(team: str) -> tuple[str, str | None]:
    archive_team = SCRAPER.archive_team(team)
    return ("escc", archive_team) if archive_team else ("opponent", None)


def normalize_match(
    match: dict[str, Any],
    competition: str | None,
    competition_source: str,
    quality: dict[str, Any],
) -> dict[str, Any]:
    innings = []
    batting_sections = match.get("batting", [])
    bowling_sections = match.get("bowling", [])
    administrative_no_play = is_administrative_no_play_result(match)
    if administrative_no_play:
        quality["suppressedAdministrativeFixtures"].append(
            {
                "fixtureId": match["fixtureId"],
                "result": match["result"]["summary"],
                "battingSections": len(batting_sections),
                "bowlingSections": len(bowling_sections),
                "battingRows": sum(
                    len(section.get("players") or [])
                    for section in batting_sections
                ),
                "bowlingRows": sum(
                    len(section.get("players") or [])
                    for section in bowling_sections
                ),
                "reason": "concession-forfeit-or-walkover",
            }
        )
    section_count = (
        0
        if administrative_no_play
        else max(len(batting_sections), len(bowling_sections))
    )
    for index in range(section_count):
        batting = batting_sections[index] if index < len(batting_sections) else None
        bowling = bowling_sections[index] if index < len(bowling_sections) else None
        if is_unplayed_innings(batting):
            quality["suppressedUnplayedInnings"].append(
                {
                    "fixtureId": match["fixtureId"],
                    "sourceInningsNumber": index + 1,
                    "battingTeam": batting.get("team"),
                    "battingRows": len(batting.get("players") or []),
                    "bowlingRows": len(bowling.get("players") or [])
                    if bowling
                    else 0,
                    "reason": "zero-total-all-dnb-template",
                }
            )
            continue
        batting_team = batting["team"] if batting else None
        bowling_team = bowling["team"] if bowling else None
        role, archive_team = (
            side_role(batting_team) if batting_team else ("unknown", None)
        )
        bowling_role, escc_bowling_team = (
            side_role(bowling_team) if bowling_team else ("unknown", None)
        )
        innings_number = len(innings) + 1
        batting_rows = normalize_batting_rows(
            batting.get("players", []) if batting else [],
            match["fixtureId"],
            innings_number,
            quality,
        )
        bowling_rows = normalize_bowling_rows(
            bowling.get("players", []) if bowling else [],
            match["fixtureId"],
            innings_number,
        )
        total = normalize_total(batting.get("total") if batting else None)
        if total and not total["overs"]:
            calculated_overs = overs_from_bowling(bowling_rows)
            if calculated_overs is not None:
                total["overs"] = calculated_overs
                total["oversSource"] = "calculated-from-bowling"
                quality["calculatedInningsOvers"].append(
                    {
                        "fixtureId": match["fixtureId"],
                        "inningsNumber": innings_number,
                        "overs": calculated_overs,
                    }
                )
        innings.append(
            {
                "id": f"{match['fixtureId']}-{innings_number}",
                "number": innings_number,
                "battingTeam": batting_team,
                "bowlingTeam": bowling_team,
                "battingTeamRole": role,
                "esccTeam": archive_team,
                "bowlingTeamRole": bowling_role,
                "esccBowlingTeam": escc_bowling_team,
                "total": total,
                "batting": batting_rows,
                "bowling": bowling_rows,
            }
        )

    player_innings_ordinals: Counter[str] = Counter()
    for entry in [
        row
        for section in innings
        for row in section["batting"]
        if row["entryType"] == "innings"
    ]:
        player_innings_ordinals[entry["playerId"]] += 1
        entry["playerInningsNumberInMatch"] = player_innings_ordinals[
            entry["playerId"]
        ]

    escc_team = next(
        (
            section["esccTeam"] or section["esccBowlingTeam"]
            for section in innings
            if section["esccTeam"] is not None
            or section["esccBowlingTeam"] is not None
        ),
        None,
    )
    if escc_team is None:
        escc_team = next(
            (
                SCRAPER.archive_team(team)
                for team in match["teams"]
                if SCRAPER.archive_team(team)
            ),
            None,
        )
    opposition = SCRAPER.match_opposition(match)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "fixtureId": match["fixtureId"],
        "date": match["date"],
        "season": match["season"],
        "title": match["title"],
        "teams": match["teams"],
        "esccTeam": escc_team,
        "opposition": opposition,
        "competition": competition,
        "competitionSource": competition_source,
        "result": match["result"],
        "innings": innings,
        "provenance": {
            "sourceUrl": match["sourceUrl"],
            "sourceSha256": match["sourceSha256"],
            "scraped": True,
            "authoritative": False,
        },
        "parseWarnings": match.get("parseWarnings", []),
    }


def score_summary(match: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "team": innings["battingTeam"],
            "runs": innings["total"]["runs"] if innings["total"] else None,
            "wickets": innings["total"]["wickets"] if innings["total"] else None,
            "overs": innings["total"]["overs"] if innings["total"] else None,
        }
        for innings in match["innings"]
    ]


def match_index_row(match: dict[str, Any]) -> dict[str, Any]:
    players = sorted(
        {
            row["player"]
            for innings in match["innings"]
            for row in (
                innings["batting"]
                if innings["battingTeamRole"] == "escc"
                else []
            )
            + (
                innings["bowling"]
                if innings["bowlingTeamRole"] == "escc"
                else []
            )
            if not row["isPlaceholder"]
        }
    )
    return {
        "fixtureId": match["fixtureId"],
        "matchNumber": match["matchNumber"],
        "date": match["date"],
        "season": match["season"],
        "esccTeam": match["esccTeam"],
        "opposition": match["opposition"],
        "competition": match["competition"],
        "outcome": match["result"]["outcome"],
        "result": match["result"]["summary"],
        "teams": match["teams"],
        "players": players,
        "scores": score_summary(match),
        "path": f"matches/{match['fixtureId']}.json",
    }


def escc_player_rows(
    match: dict[str, Any],
) -> Iterable[tuple[dict[str, Any], str, dict[str, Any]]]:
    for innings in match["innings"]:
        if innings["battingTeamRole"] == "escc":
            for row in innings["batting"]:
                if not row["isPlaceholder"]:
                    yield innings, "batting", row
        if innings["bowlingTeamRole"] == "escc":
            for row in innings["bowling"]:
                if not row["isPlaceholder"]:
                    yield innings, "bowling", row


def build_player_data(
    matches: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list, list, list]:
    players: dict[str, dict[str, Any]] = {}
    appearance_parts: dict[tuple[str, str], dict[str, Any]] = {}
    batting_innings = []
    bowling_spells = []

    for match in matches:
        for innings, discipline, row in escc_player_rows(match):
            player = players.setdefault(
                row["playerId"],
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "playerId": row["playerId"],
                    "name": row["player"],
                    "memberIds": set(),
                    "appearances": [],
                    "battingInnings": [],
                    "bowlingSpells": [],
                },
            )
            if row.get("memberId"):
                player["memberIds"].add(row["memberId"])
            key = (row["playerId"], match["fixtureId"])
            appearance = appearance_parts.setdefault(
                key,
                {
                    "playerId": row["playerId"],
                    "player": player["name"],
                    "fixtureId": match["fixtureId"],
                    "date": match["date"],
                    "season": match["season"],
                    "team": match["esccTeam"],
                    "opposition": match["opposition"],
                    "competition": match["competition"],
                    "outcome": match["result"]["outcome"],
                    "battingInningsCount": 0,
                    "bowlingSpellCount": 0,
                    "didNotBat": False,
                    "catches": 0,
                    "stumpings": 0,
                    "runOuts": 0,
                },
            )
            if discipline == "batting":
                # Fielding figures are match-level enrichments and can appear
                # on more than one retained batting row. Retain the largest
                # supplied value rather than double-counting duplicate rows.
                for field in ("catches", "stumpings", "runOuts"):
                    appearance[field] = max(
                        appearance[field], row.get(field) or 0
                    )
                if row["entryType"] == "innings":
                    item = {
                        "playerId": row["playerId"],
                        "player": player["name"],
                        "fixtureId": match["fixtureId"],
                        "inningsId": innings["id"],
                        "date": match["date"],
                        "season": match["season"],
                        "team": match["esccTeam"],
                        "opposition": match["opposition"],
                        "competition": match["competition"],
                        "inningsNumberInMatch": row["playerInningsNumberInMatch"],
                        "dismissalType": dismissal_category(
                            row["dismissal"], row["notOut"]
                        ),
                        **{
                            field: row[field]
                            for field in (
                                "dismissal",
                                "notOut",
                                "runs",
                                "minutes",
                                "balls",
                                "fours",
                                "sixes",
                                "strikeRate",
                            )
                        },
                    }
                    batting_innings.append(
                        {**item, "battingPosition": row["rowNumber"]}
                    )
                    player["battingInnings"].append(item)
                    appearance["battingInningsCount"] += 1
                else:
                    appearance["didNotBat"] = True
            else:
                item = {
                    "playerId": row["playerId"],
                    "player": player["name"],
                    "fixtureId": match["fixtureId"],
                    "inningsId": innings["id"],
                    "date": match["date"],
                    "season": match["season"],
                    "team": match["esccTeam"],
                    "opposition": match["opposition"],
                    "competition": match["competition"],
                    **{
                        field: row[field]
                        for field in (
                            "overs",
                            "balls",
                            "maidens",
                            "runs",
                            "wickets",
                            "average",
                            "economy",
                        )
                    },
                }
                bowling_spells.append(item)
                player["bowlingSpells"].append(item)
                appearance["bowlingSpellCount"] += 1

    appearances = sorted(
        appearance_parts.values(),
        key=lambda row: (row["date"], row["fixtureId"], row["player"]),
    )
    for appearance in appearances:
        appearance["didNotBat"] = (
            appearance["didNotBat"]
            and appearance["battingInningsCount"] == 0
        )
        players[appearance["playerId"]]["appearances"].append(appearance)

    player_index = []
    for player_id, player in sorted(
        players.items(), key=lambda item: item[1]["name"].casefold()
    ):
        dates = [row["date"] for row in player["appearances"]]
        batting_with_balls = [
            row
            for row in player["battingInnings"]
            if row["balls"] is not None and row["balls"] > 0
        ]
        batting_runs_with_balls = sum(
            row["runs"] or 0 for row in batting_with_balls
        )
        batting_balls = sum(row["balls"] or 0 for row in batting_with_balls)
        bowling_balls = sum(
            row["balls"] or 0 for row in player["bowlingSpells"]
        )
        bowling_wickets = sum(
            row["wickets"] or 0 for row in player["bowlingSpells"]
        )
        dismissal_counts = Counter(
            row["dismissalType"]
            for row in player["battingInnings"]
            if row["dismissalType"]
        )
        player["memberIds"] = sorted(player["memberIds"])
        player["appearances"].sort(
            key=lambda row: (row["date"], row["fixtureId"])
        )
        player["battingInnings"].sort(
            key=lambda row: (
                row["date"],
                row["fixtureId"],
                row["inningsNumberInMatch"],
            )
        )
        player["bowlingSpells"].sort(
            key=lambda row: (row["date"], row["fixtureId"], row["inningsId"])
        )
        player_index.append(
            {
                "playerId": player_id,
                "name": player["name"],
                "memberIds": player["memberIds"],
                "appearanceCount": len(player["appearances"]),
                "battingInningsCount": len(player["battingInnings"]),
                "bowlingSpellCount": len(player["bowlingSpells"]),
                "firstAppearance": min(dates),
                "lastAppearance": max(dates),
                "path": f"players/{player_id}.json",
                "scorecardMetrics": {
                    "battingRunsWithBalls": batting_runs_with_balls,
                    "battingBalls": batting_balls,
                    "battingInningsWithBalls": len(batting_with_balls),
                    "battingStrikeRate": (
                        batting_runs_with_balls * 100 / batting_balls
                        if batting_balls
                        else None
                    ),
                    "bowlingBalls": bowling_balls,
                    "bowlingWickets": bowling_wickets,
                    "bowlingStrikeRate": (
                        bowling_balls / bowling_wickets
                        if bowling_wickets
                        else None
                    ),
                    "dismissals": {
                        category: dismissal_counts.get(category, 0)
                        for category in DISMISSAL_CATEGORIES
                    },
                },
            }
        )

    return (
        player_index,
        players,
        appearances,
        sorted(
            batting_innings,
            key=lambda row: (
                row["date"],
                row["fixtureId"],
                row["player"],
                row["inningsNumberInMatch"],
            ),
        ),
        sorted(
            bowling_spells,
            key=lambda row: (row["date"], row["fixtureId"], row["player"]),
        ),
    )


def build_records_player_map(
    records: dict[str, Any], player_index: list[dict[str, Any]]
) -> dict[str, Any]:
    """Join authoritative record names to scorecard player identities."""

    scorecard_by_name = {
        normalized_name(player["name"]): player for player in player_index
    }
    record_names = sorted(
        {
            row[0]
            for discipline in ("batting", "bowling")
            for row in records[discipline]
        },
        key=str.casefold,
    )
    mappings = {}
    directory_by_id: dict[str, dict[str, Any]] = {}
    for record_name in record_names:
        scorecard_player = scorecard_by_name.get(normalized_name(record_name))
        mappings[record_name] = (
            {
                "playerId": scorecard_player["playerId"],
                "scorecardName": scorecard_player["name"],
                "path": scorecard_player["path"],
                "appearanceCount": scorecard_player["appearanceCount"],
                "battingInningsCount": scorecard_player[
                    "battingInningsCount"
                ],
                "bowlingSpellCount": scorecard_player["bowlingSpellCount"],
                "matchMethod": "normalized-exact",
            }
            if scorecard_player
            else None
        )
        record_player_id = canonical_player_id(record_name)
        directory_entry = directory_by_id.setdefault(
            record_player_id,
            {
                "playerId": record_player_id,
                "name": display_name(record_name),
                "aliases": [],
                "scorecardPlayerId": None,
                "scorecardPath": None,
                "scorecardMetrics": None,
            },
        )
        directory_entry["aliases"].append(record_name)
        if scorecard_player:
            directory_entry["scorecardPlayerId"] = scorecard_player["playerId"]
            directory_entry["scorecardPath"] = scorecard_player["path"]
            directory_entry["scorecardMetrics"] = scorecard_player.get(
                "scorecardMetrics"
            )

    directory = sorted(
        (
            {
                **entry,
                "aliases": sorted(set(entry["aliases"]), key=str.casefold),
            }
            for entry in directory_by_id.values()
        ),
        key=lambda entry: entry["name"].casefold(),
    )

    matched_player_ids = {
        mapping["playerId"] for mapping in mappings.values() if mapping
    }
    unmatched_scorecard_players = [
        {
            "playerId": player["playerId"],
            "name": player["name"],
            "path": player["path"],
        }
        for player in player_index
        if player["playerId"] not in matched_player_ids
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "matchMethod": "normalized-exact",
        "summary": {
            "recordPlayerCount": len(record_names),
            "matchedRecordPlayerCount": sum(
                mapping is not None for mapping in mappings.values()
            ),
            "matchedScorecardPlayerCount": len(matched_player_ids),
            "unmatchedRecordPlayerCount": sum(
                mapping is None for mapping in mappings.values()
            ),
            "unmatchedScorecardPlayerCount": len(
                unmatched_scorecard_players
            ),
        },
        "players": mappings,
        "directory": directory,
        "unmatchedRecordPlayers": [
            name for name, mapping in mappings.items() if mapping is None
        ],
        "unmatchedScorecardPlayers": unmatched_scorecard_players,
    }


def empty_record_stats(name: str) -> dict[str, Any]:
    return {
        "name": name,
        "matches": set(),
        "innings": 0,
        "runs": 0,
        "outs": 0,
        "highScore": 0,
        "highScoreNotOut": False,
        "fifties": 0,
        "hundreds": 0,
        "catches": 0,
        "stumpings": 0,
        "runOuts": 0,
        "balls": 0,
        "maidens": 0,
        "bowlingRuns": 0,
        "wickets": 0,
        "bestWickets": 0,
        "bestRuns": 0,
        "fiveWicketHauls": 0,
    }


def record_match_key(row: list[Any]) -> str:
    return f"{row[5]}|{row[2]}|{row[4]}"


def add_record_batting(stats: dict[str, Any], row: list[Any]) -> None:
    runs = row[6] if isinstance(row[6], int) else 0
    if not row[8]:
        stats["innings"] += 1
        stats["runs"] += runs
        if runs > stats["highScore"] or (
            runs == stats["highScore"]
            and row[7]
            and not stats["highScoreNotOut"]
        ):
            stats["highScore"] = runs
            stats["highScoreNotOut"] = row[7]
        if not row[7]:
            stats["outs"] += 1
        if runs >= 100:
            stats["hundreds"] += 1
        elif runs >= 50:
            stats["fifties"] += 1
    stats["catches"] += row[9]
    stats["stumpings"] += row[10]
    stats["runOuts"] += row[11]
    stats["matches"].add(record_match_key(row))


def add_record_bowling(stats: dict[str, Any], row: list[Any]) -> None:
    stats["balls"] += row[6]
    stats["maidens"] += row[7]
    stats["bowlingRuns"] += row[8]
    stats["wickets"] += row[9]
    if row[9] >= 5:
        stats["fiveWicketHauls"] += 1
    if row[9] > stats["bestWickets"] or (
        row[9] == stats["bestWickets"]
        and (stats["bestRuns"] == 0 or row[8] < stats["bestRuns"])
    ):
        stats["bestWickets"] = row[9]
        stats["bestRuns"] = row[8]
    stats["matches"].add(record_match_key(row))


def serialized_record_stats(stats: dict[str, Any]) -> dict[str, Any]:
    return {**stats, "matches": len(stats["matches"])}


def build_record_profiles(
    records: dict[str, Any], directory: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    entry_by_alias = {
        normalized_name(alias): entry
        for entry in directory
        for alias in entry["aliases"]
    }
    career = {
        entry["playerId"]: empty_record_stats(entry["name"])
        for entry in directory
    }
    seasons: dict[str, dict[int, dict[str, Any]]] = defaultdict(dict)
    batting_seasons: dict[str, set[int]] = defaultdict(set)
    bowling_seasons: dict[str, set[int]] = defaultdict(set)

    def season_stats(entry: dict[str, Any], season: int) -> dict[str, Any]:
        player_seasons = seasons[entry["playerId"]]
        return player_seasons.setdefault(
            season, empty_record_stats(entry["name"])
        )

    for row in records["batting"]:
        entry = entry_by_alias.get(normalized_name(row[0]))
        if not entry:
            continue
        add_record_batting(career[entry["playerId"]], row)
        add_record_batting(season_stats(entry, row[1]), row)
        batting_seasons[entry["playerId"]].add(row[1])
    for row in records["bowling"]:
        entry = entry_by_alias.get(normalized_name(row[0]))
        if not entry:
            continue
        add_record_bowling(career[entry["playerId"]], row)
        add_record_bowling(season_stats(entry, row[1]), row)
        bowling_seasons[entry["playerId"]].add(row[1])

    boundaries = defaultdict(lambda: {"fours": 0, "sixes": 0})
    for name, fours, sixes in records.get("boundaries", []):
        entry = entry_by_alias.get(normalized_name(name))
        if entry:
            boundaries[entry["playerId"]]["fours"] += fours
            boundaries[entry["playerId"]]["sixes"] += sixes

    profiles = {}
    for entry in directory:
        player_id = entry["playerId"]
        career_stats = serialized_record_stats(career[player_id])
        entry["profilePath"] = f"profiles/{player_id}.json"
        entry["career"] = {
            "appearances": career_stats["matches"],
            "runs": career_stats["runs"],
            "wickets": career_stats["wickets"],
        }
        profiles[player_id] = {
            "schemaVersion": SCHEMA_VERSION,
            "playerId": player_id,
            "name": entry["name"],
            "career": career_stats,
            "seasons": [
                {
                    "season": season,
                    "stats": serialized_record_stats(stats),
                }
                for season, stats in sorted(seasons[player_id].items())
            ],
            "battingSeasons": sorted(batting_seasons[player_id]),
            "bowlingSeasons": sorted(bowling_seasons[player_id]),
            "boundaries": boundaries[player_id],
        }
    return profiles


MILESTONE_RULES = {
    "runs": {"start": 1000, "step": 500, "label": "runs"},
    "wickets": {"start": 100, "step": 50, "label": "wickets"},
    "appearances": {"start": 100, "step": 50, "label": "appearances"},
    "catches": {"start": 50, "step": 50, "label": "catches"},
    "stumpings": {"start": 25, "step": 25, "label": "stumpings"},
    "runOuts": {"start": 25, "step": 25, "label": "run outs"},
}


def next_milestone(current: int, rule: dict[str, Any]) -> int:
    if current < rule["start"]:
        return rule["start"]
    return rule["start"] + (
        ((current - rule["start"]) // rule["step"] + 1) * rule["step"]
    )


def build_milestones(
    records: dict[str, Any],
    directory: list[dict[str, Any]],
    matches: list[dict[str, Any]],
) -> dict[str, Any]:
    entry_by_alias = {
        normalized_name(alias): entry
        for entry in directory
        for alias in entry["aliases"]
    }
    match_by_exact = {
        (
            match["date"],
            match.get("esccTeam"),
            normalized_name(match.get("opposition") or ""),
        ): match
        for match in matches
    }
    matches_by_date_team: dict[tuple[str, str | None], list[dict[str, Any]]] = (
        defaultdict(list)
    )
    for match in matches:
        matches_by_date_team[(match["date"], match.get("esccTeam"))].append(
            match
        )

    events: dict[
        str, dict[str, dict[tuple[str, str, str], int]]
    ] = {
        metric: defaultdict(lambda: defaultdict(int))
        for metric in MILESTONE_RULES
    }
    appearances: dict[str, set[tuple[str, str, str]]] = defaultdict(set)

    def row_entry(row: list[Any]) -> dict[str, Any] | None:
        return entry_by_alias.get(normalized_name(row[0]))

    def row_key(row: list[Any]) -> tuple[str, str, str]:
        return (row[5], row[2], row[4])

    for row in records["batting"]:
        entry = row_entry(row)
        if not entry:
            continue
        player_id = entry["playerId"]
        key = row_key(row)
        appearances[player_id].add(key)
        if isinstance(row[6], int):
            events["runs"][player_id][key] += row[6]
        events["catches"][player_id][key] += row[9]
        events["stumpings"][player_id][key] += row[10]
        events["runOuts"][player_id][key] += row[11]
    for row in records["bowling"]:
        entry = row_entry(row)
        if not entry:
            continue
        player_id = entry["playerId"]
        key = row_key(row)
        appearances[player_id].add(key)
        events["wickets"][player_id][key] += row[9]
    for player_id, keys in appearances.items():
        for key in keys:
            events["appearances"][player_id][key] = 1

    directory_by_id = {entry["playerId"]: entry for entry in directory}
    as_of = calendar_date.fromisoformat(records["meta"]["asOfDate"])
    month_index = as_of.month - 1 - 6
    cutoff_year = as_of.year + month_index // 12
    cutoff_month = month_index % 12 + 1
    active_cutoff = as_of.replace(
        year=cutoff_year,
        month=cutoff_month,
        day=min(as_of.day, calendar.monthrange(cutoff_year, cutoff_month)[1]),
    )
    last_appearance = {
        player_id: max(calendar_date.fromisoformat(key[0]) for key in keys)
        for player_id, keys in appearances.items()
        if keys
    }
    achieved: dict[str, list[dict[str, Any]]] = defaultdict(list)
    upcoming: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for metric, rule in MILESTONE_RULES.items():
        for player_id, player_events in events[metric].items():
            total = 0
            target = rule["start"]
            for (date, team, opposition), increment in sorted(
                player_events.items()
            ):
                previous = total
                total += increment
                while previous < target <= total:
                    match = match_by_exact.get(
                        (date, team, normalized_name(opposition))
                    )
                    if not match:
                        candidates = matches_by_date_team.get((date, team), [])
                        if len(candidates) == 1:
                            match = candidates[0]
                    achieved[metric].append(
                        {
                            "metric": metric,
                            "label": rule["label"],
                            "player": directory_by_id[player_id]["name"],
                            "playerId": player_id,
                            "milestone": target,
                            "date": date,
                            "team": team,
                            "opposition": opposition,
                            "fixtureId": match["fixtureId"] if match else None,
                        }
                    )
                    target += rule["step"]
            next_target = next_milestone(total, rule)
            upcoming[metric].append(
                {
                    "metric": metric,
                    "label": rule["label"],
                    "player": directory_by_id[player_id]["name"],
                    "playerId": player_id,
                    "current": total,
                    "milestone": next_target,
                    "remaining": next_target - total,
                }
            )

    section_metrics = {
        "batting": ["runs"],
        "bowling": ["wickets"],
        "fielding": ["catches", "stumpings", "runOuts"],
        "appearances": ["appearances"],
    }
    titles = {
        "batting": "Batting",
        "bowling": "Bowling",
        "fielding": "Fielding",
        "appearances": "Appearances",
    }
    sections = []
    for key, metrics in section_metrics.items():
        recent_rows = sorted(
            [row for metric in metrics for row in achieved[metric]],
            key=lambda row: (row["date"], row["milestone"], row["player"]),
            reverse=True,
        )[:25]
        upcoming_rows = sorted(
            [
                row
                for metric in metrics
                for row in upcoming[metric]
                if last_appearance.get(row["playerId"], calendar_date.min)
                >= active_cutoff
            ],
            key=lambda row: (row["remaining"], -row["current"], row["player"]),
        )[:25]
        sections.append(
            {
                "key": key,
                "title": titles[key],
                "recent": recent_rows,
                "upcoming": upcoming_rows,
            }
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "asOfDate": records["meta"].get("asOfDate"),
        "sections": sections,
    }


def build_club_insights(matches: list[dict[str, Any]]) -> dict[str, Any]:
    """Prepare compact match/innings aggregates for the Insights dashboard."""

    match_rows = []
    innings_rows = []
    dismissal_counts: Counter[tuple[int, str | None, str | None, str]] = (
        Counter()
    )
    for match in matches:
        first_role = (
            match["innings"][0]["battingTeamRole"]
            if match["innings"]
            else None
        )
        match_rows.append(
            {
                "fixtureId": match["fixtureId"],
                "season": match["season"],
                "team": match["esccTeam"],
                "competition": match["competition"],
                "outcome": match["result"]["outcome"],
                "firstBattingRole": first_role,
            }
        )
        for innings in match["innings"]:
            total = innings.get("total") or {}
            runs = total.get("runs")
            wickets = total.get("wickets")
            role = innings["battingTeamRole"]
            innings_rows.append(
                {
                    "fixtureId": match["fixtureId"],
                    "season": match["season"],
                    "team": match["esccTeam"],
                    "competition": match["competition"],
                    "outcome": match["result"]["outcome"],
                    "inningsNumber": innings["number"],
                    "battingRole": role,
                    "runs": runs,
                    "wickets": wickets,
                    "overs": total.get("overs"),
                }
            )
            if role != "escc":
                continue
            for row in innings["batting"]:
                if (
                    row["entryType"] != "innings"
                    or row["isPlaceholder"]
                    or row["notOut"]
                ):
                    continue
                category = (
                    dismissal_category(row.get("dismissal"), row["notOut"])
                    or "other"
                )
                dismissal_counts[
                    (
                        match["season"],
                        match["esccTeam"],
                        match["competition"],
                        category,
                    )
                ] += 1
    dismissals = [
        {
            "season": season,
            "team": team,
            "competition": competition,
            "type": category,
            "count": count,
        }
        for (season, team, competition, category), count in sorted(
            dismissal_counts.items(),
            key=lambda item: (
                item[0][0],
                item[0][1] or "",
                item[0][2] or "",
                item[0][3],
            ),
        )
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "dismissalCategories": list(DISMISSAL_CATEGORIES),
        "matches": match_rows,
        "innings": innings_rows,
        "dismissals": dismissals,
    }


def build_player_link_report(
    matches: list[dict[str, Any]], player_map: dict[str, Any]
) -> dict[str, Any]:
    linked_ids = {
        entry["scorecardPlayerId"]
        for entry in player_map["directory"]
        if entry["scorecardPlayerId"]
    }
    linked_references = 0
    unresolved = []
    for match in matches:
        for innings in match["innings"]:
            for discipline, rows, is_escc in (
                (
                    "batting",
                    innings["batting"],
                    innings["battingTeamRole"] == "escc",
                ),
                (
                    "bowling",
                    innings["bowling"],
                    innings["bowlingTeamRole"] == "escc",
                ),
            ):
                if not is_escc:
                    continue
                for row in rows:
                    if row["isPlaceholder"]:
                        continue
                    if row["playerId"] in linked_ids:
                        linked_references += 1
                    else:
                        unresolved.append(
                            {
                                "fixtureId": match["fixtureId"],
                                "inningsId": innings["id"],
                                "discipline": discipline,
                                "player": row["player"],
                                "scorecardPlayerId": row["playerId"],
                            }
                        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "summary": {
            "linkedReferenceCount": linked_references,
            "unresolvedReferenceCount": len(unresolved),
            "unresolvedPlayerCount": len(
                {row["scorecardPlayerId"] for row in unresolved}
            ),
        },
        "unresolved": unresolved,
    }


def schema_document() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "authoritative": False,
        "authority": {
            "careerRecords": "public/data/records.json",
            "scorecardEnrichment": "public/data/scorecards/",
        },
        "identityRules": {
            "appearance": "One player per fixture, regardless of innings count.",
            "battingInnings": "Every retained genuine batting row.",
            "multipleInnings": (
                "Multiple genuine batting rows in a fixture are retained as "
                "separate innings but share one appearance."
            ),
            "dnbWithInnings": (
                "A named DNB row is suppressed when the same player has a "
                "genuine innings in that team innings."
            ),
            "dnbOnly": "One appearance and zero batting innings.",
            "placeholders": (
                "Placeholder rows receive fixture-local identities and are "
                "excluded from career player indexes."
            ),
        },
        "normalizationRules": {
            "administrativeResults": (
                "Fixtures decided by concession, forfeit or walkover retain "
                "their fixture and result but have no innings, appearances or "
                "performances."
            ),
            "inningsOvers": (
                "When the innings total omits overs and every bowling row "
                "has a ball count, overs are calculated from the summed "
                "balls using six-ball overs."
            ),
            "unplayedInnings": (
                "A zero-run, zero-wicket section with no overs and every "
                "listed batter marked did-not-bat is treated as an unused "
                "scorecard template, not a played innings. Its paired "
                "bowling rows are suppressed with it."
            ),
        },
        "files": {
            "index.json": "Compact searchable match index and filter values.",
            "matches/{fixtureId}.json": "Normalized scorecard and provenance.",
            "players/index.json": "Compact ESCC player index.",
            "players/{playerId}.json": "Player appearances, innings and spells.",
            "records-player-map.json": (
                "Exact normalized-name links from authoritative Vault players "
                "to scorecard player histories."
            ),
            "player-directory.json": (
                "Stable profile routes for authoritative Vault players, with "
                "record-name aliases and optional scorecard-history links."
            ),
            "appearances.json": "One row per ESCC player appearance per fixture.",
            "batting-innings.json": "Every retained ESCC batting innings.",
            "bowling-spells.json": "Every retained ESCC bowling spell.",
            "club-insights.json": (
                "Compact match, innings and ESCC batting-dismissal aggregates."
            ),
            "player-link-quality.json": (
                "Scorecard player references that cannot be linked safely."
            ),
            "coverage.json": "Field availability by season.",
            "data-quality.json": "Suppression and normalization decisions.",
            "provenance.json": "Source identity, hashes and authority boundary.",
        },
    }


def coverage_report(matches: list[dict[str, Any]]) -> dict[str, Any]:
    report: dict[str, Any] = {}
    by_season: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for match in matches:
        by_season[match["season"]].append(match)
    for season, season_matches in sorted(by_season.items()):
        batting = [
            row
            for match in season_matches
            for innings in match["innings"]
            if innings["battingTeamRole"] == "escc"
            for row in innings["batting"]
            if row["entryType"] == "innings" and not row["isPlaceholder"]
        ]
        bowling = [
            row
            for match in season_matches
            for innings in match["innings"]
            if innings["bowlingTeamRole"] == "escc"
            for row in innings["bowling"]
            if not row["isPlaceholder"]
        ]
        report[str(season)] = {
            "matches": len(season_matches),
            "battingInnings": len(batting),
            "bowlingSpells": len(bowling),
            "battingBallsAvailable": sum(row["balls"] is not None for row in batting),
            "boundariesAvailable": sum(
                row["fours"] is not None or row["sixes"] is not None
                for row in batting
            ),
            "fieldingAvailable": sum(
                row["catches"] is not None
                or row["stumpings"] is not None
                or row["runOuts"] is not None
                for row in batting
            ),
            "bowlingBallsAvailable": sum(
                row["balls"] is not None for row in bowling
            ),
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "note": "Counts describe scorecard enrichment coverage, not authority.",
        "seasons": report,
    }


def validate_export(
    matches: list[dict[str, Any]],
    player_index: list[dict[str, Any]],
    appearances: list[dict[str, Any]],
    batting_innings: list[dict[str, Any]],
    quality: dict[str, Any],
) -> dict[str, Any]:
    fixture_ids = [match["fixtureId"] for match in matches]
    if len(fixture_ids) != len(set(fixture_ids)):
        raise ValueError("Duplicate fixture IDs in production export")
    appearance_keys = [
        (row["playerId"], row["fixtureId"]) for row in appearances
    ]
    if len(appearance_keys) != len(set(appearance_keys)):
        raise ValueError("Duplicate player appearances in production export")
    for appearance in appearances:
        if appearance["didNotBat"] and appearance["battingInningsCount"]:
            raise ValueError(
                "A DNB appearance also contains a batting innings: "
                f"{appearance['fixtureId']} {appearance['player']}"
            )
    for match in matches:
        if is_administrative_no_play_result(match) and match["innings"]:
            raise ValueError(
                "Administrative no-play fixture retains innings: "
                f"{match['fixtureId']}"
            )
        for innings in match["innings"]:
            named_real = {
                row["playerId"]
                for row in innings["batting"]
                if not row["isPlaceholder"] and row["entryType"] == "innings"
            }
            named_dnb = {
                row["playerId"]
                for row in innings["batting"]
                if not row["isPlaceholder"]
                and row["entryType"] == "did-not-bat"
            }
            overlap = named_real & named_dnb
            if overlap:
                raise ValueError(
                    f"Innings {innings['id']} retains both innings and DNB: "
                    f"{sorted(overlap)}"
                )
    return {
        "fixtureCount": len(matches),
        "playerCount": len(player_index),
        "appearanceCount": len(appearances),
        "battingInningsCount": len(batting_innings),
        "uniqueFixtureIds": len(set(fixture_ids)),
        "uniqueAppearanceKeys": len(set(appearance_keys)),
        "suppressedDnbRows": len(quality["suppressedDnbRows"]),
        "collapsedDuplicateDnbRows": len(
            quality["collapsedDuplicateDnbRows"]
        ),
        "status": "passed",
    }


def export(
    source_path: Path, records_path: Path, output_path: Path
) -> dict[str, Any]:
    source = json.loads(source_path.read_text(encoding="utf-8"))
    records = json.loads(records_path.read_text(encoding="utf-8"))
    competition_overrides = (
        json.loads(COMPETITION_OVERRIDES_PATH.read_text(encoding="utf-8"))
        if COMPETITION_OVERRIDES_PATH.exists()
        else {}
    )
    exact, fallback = competition_lookup(records)
    quality: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "suppressedDnbRows": [],
        "collapsedDuplicateDnbRows": [],
        "calculatedInningsOvers": [],
        "suppressedUnplayedInnings": [],
        "suppressedAdministrativeFixtures": [],
        "competitionClassification": Counter(),
        "sourceParseWarnings": [],
    }
    matches = []
    for raw_match in source["matches"]:
        competition, competition_source = competition_for_match(
            raw_match, exact, fallback
        )
        if (
            competition is None
            and raw_match["fixtureId"] in competition_overrides
        ):
            competition = competition_overrides[raw_match["fixtureId"]]
            competition_source = "curated-fixture"
        quality["competitionClassification"][competition_source] += 1
        if raw_match.get("parseWarnings"):
            quality["sourceParseWarnings"].append(
                {
                    "fixtureId": raw_match["fixtureId"],
                    "warnings": raw_match["parseWarnings"],
                }
            )
        matches.append(
            normalize_match(
                raw_match, competition, competition_source, quality
            )
        )
    matches.sort(key=lambda row: (row["date"], row["fixtureId"]))
    for match_number, match in enumerate(matches, start=1):
        match["matchNumber"] = match_number

    (
        player_index,
        players,
        appearances,
        batting_innings,
        bowling_spells,
    ) = build_player_data(matches)
    player_map = build_records_player_map(records, player_index)
    record_profiles = build_record_profiles(records, player_map["directory"])
    milestones = build_milestones(records, player_map["directory"], matches)
    club_insights = build_club_insights(matches)
    player_link_report = build_player_link_report(matches, player_map)
    validation = validate_export(
        matches, player_index, appearances, batting_innings, quality
    )
    quality["competitionClassification"] = dict(
        sorted(quality["competitionClassification"].items())
    )
    quality["multipleBattingInnings"] = [
        {
            "fixtureId": row["fixtureId"],
            "playerId": row["playerId"],
            "player": row["player"],
            "inningsCount": row["battingInningsCount"],
        }
        for row in appearances
        if row["battingInningsCount"] > 1
    ]
    quality["summary"] = {
        **validation,
        "bowlingSpellCount": len(bowling_spells),
        "dnbOnlyAppearanceCount": sum(
            row["didNotBat"] for row in appearances
        ),
        "multipleBattingInningsAppearanceCount": len(
            quality["multipleBattingInnings"]
        ),
        "sourceParseWarningCount": len(quality["sourceParseWarnings"]),
        "calculatedInningsOversCount": len(
            quality["calculatedInningsOvers"]
        ),
        "suppressedUnplayedInningsCount": len(
            quality["suppressedUnplayedInnings"]
        ),
        "suppressedAdministrativeFixtureCount": len(
            quality["suppressedAdministrativeFixtures"]
        ),
        **player_map["summary"],
    }

    output_path = output_path.resolve()
    expected_parent = (ROOT / "public" / "data").resolve()
    if output_path.parent != expected_parent or output_path.name != "scorecards":
        raise ValueError(
            "Production output must be the repository's "
            "public/data/scorecards directory"
        )
    temp_path = Path(
        tempfile.mkdtemp(prefix="scorecards-export-", dir=output_path.parent)
    )
    try:
        for match in matches:
            compact_json(
                temp_path / "matches" / f"{match['fixtureId']}.json", match
            )
        for player_id, player in players.items():
            compact_json(temp_path / "players" / f"{player_id}.json", player)
        for player_id, profile in record_profiles.items():
            compact_json(temp_path / "profiles" / f"{player_id}.json", profile)

        index_rows = [match_index_row(match) for match in matches]
        index = {
            "schemaVersion": SCHEMA_VERSION,
            "generatedAt": source["meta"]["generatedAt"],
            "authoritative": False,
            "source": source["meta"]["source"],
            "meta": {
                "matchCount": len(matches),
                "seasonStart": min(row["season"] for row in matches),
                "seasonEnd": max(row["season"] for row in matches),
                "teams": sorted(
                    {row["esccTeam"] for row in matches if row["esccTeam"]}
                ),
                "competitions": sorted(
                    {
                        row["competition"]
                        for row in matches
                        if row["competition"]
                    }
                ),
                "oppositions": sorted(
                    {
                        row["opposition"]
                        for row in matches
                        if row["opposition"]
                    }
                ),
                "outcomes": sorted(
                    {row["result"]["outcome"] for row in matches}
                ),
            },
            "matches": index_rows,
        }
        compact_json(temp_path / "index.json", index)
        compact_json(
            temp_path / "players" / "index.json",
            {
                "schemaVersion": SCHEMA_VERSION,
                "playerCount": len(player_index),
                "players": player_index,
            },
        )
        readable_json(temp_path / "records-player-map.json", player_map)
        compact_json(
            temp_path / "player-directory.json",
            {
                "schemaVersion": SCHEMA_VERSION,
                "playerCount": len(player_map["directory"]),
                "players": player_map["directory"],
            },
        )
        compact_json(temp_path / "appearances.json", appearances)
        compact_json(temp_path / "batting-innings.json", batting_innings)
        compact_json(temp_path / "bowling-spells.json", bowling_spells)
        compact_json(temp_path / "club-insights.json", club_insights)
        compact_json(temp_path / "milestones.json", milestones)
        readable_json(
            temp_path / "player-link-quality.json", player_link_report
        )
        readable_json(temp_path / "coverage.json", coverage_report(matches))
        readable_json(temp_path / "data-quality.json", quality)
        readable_json(temp_path / "schema.json", schema_document())
        readable_json(
            temp_path / "provenance.json",
            {
                "schemaVersion": SCHEMA_VERSION,
                "generatedAt": source["meta"]["generatedAt"],
                "source": source["meta"]["source"],
                "sourceArchive": str(source_path.relative_to(ROOT)),
                "sourceArchiveSha256": hashlib.sha256(
                    source_path.read_bytes()
                ).hexdigest(),
                "sourceScorecardCount": len(source["matches"]),
                "careerRecords": str(records_path.relative_to(ROOT)),
                "careerRecordsSha256": hashlib.sha256(
                    records_path.read_bytes()
                ).hexdigest(),
                "authoritativeCareerRecords": True,
                "authoritativeScorecards": False,
            },
        )

        if output_path.exists():
            shutil.rmtree(output_path)
        temp_path.replace(output_path)
    except Exception:
        shutil.rmtree(temp_path, ignore_errors=True)
        raise
    return quality["summary"]


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=ROOT / "data" / "scorecards" / "archive" / "scorecards.json",
    )
    parser.add_argument(
        "--records",
        type=Path,
        default=ROOT / "public" / "data" / "records.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "public" / "data" / "scorecards",
    )
    return parser.parse_args()


def main() -> None:
    args = arguments()
    summary = export(args.source, args.records, args.output)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
