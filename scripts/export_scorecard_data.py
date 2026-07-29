#!/usr/bin/env python3
"""Build production-ready Vault datasets from the scraped scorecard archive.

The workbook-derived ``public/data/records.json`` remains authoritative. This
exporter creates a separate, traceable scorecard dataset designed for lazy
loading by fixture and player.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
SCRAPER_PATH = ROOT / "scripts" / "scrape_scorecards.py"
SCHEMA_VERSION = "1.0.0"
PLACEHOLDER_NAMES = {
    "a.n. other",
    "fill-in",
    "no player / one off player",
    "selected member not found",
    "tbc",
}


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
    return re.sub(r"\s+", " ", value).strip()


def is_placeholder(value: str) -> bool:
    return normalized_name(value) in PLACEHOLDER_NAMES


def slug(value: str) -> str:
    value = normalized_name(value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:42] or "player"


def canonical_player_id(value: str) -> str:
    identity = normalized_name(value)
    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:8]
    return f"p-{slug(value)}-{digest}"


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
    section_count = max(len(batting_sections), len(bowling_sections))
    for index in range(section_count):
        batting = batting_sections[index] if index < len(batting_sections) else None
        bowling = bowling_sections[index] if index < len(bowling_sections) else None
        batting_team = batting["team"] if batting else None
        bowling_team = bowling["team"] if bowling else None
        role, archive_team = (
            side_role(batting_team) if batting_team else ("unknown", None)
        )
        bowling_role, escc_bowling_team = (
            side_role(bowling_team) if bowling_team else ("unknown", None)
        )
        innings_number = index + 1
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
                "total": normalize_total(batting.get("total") if batting else None),
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
            section["esccTeam"]
            for section in innings
            if section["esccTeam"] is not None
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
    return {
        "fixtureId": match["fixtureId"],
        "date": match["date"],
        "season": match["season"],
        "esccTeam": match["esccTeam"],
        "opposition": match["opposition"],
        "competition": match["competition"],
        "outcome": match["result"]["outcome"],
        "result": match["result"]["summary"],
        "teams": match["teams"],
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
                },
            )
            if discipline == "batting":
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
                    batting_innings.append(item)
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
        "files": {
            "index.json": "Compact searchable match index and filter values.",
            "matches/{fixtureId}.json": "Normalized scorecard and provenance.",
            "players/index.json": "Compact ESCC player index.",
            "players/{playerId}.json": "Player appearances, innings and spells.",
            "appearances.json": "One row per ESCC player appearance per fixture.",
            "batting-innings.json": "Every retained ESCC batting innings.",
            "bowling-spells.json": "Every retained ESCC bowling spell.",
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
    exact, fallback = competition_lookup(records)
    quality: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "suppressedDnbRows": [],
        "collapsedDuplicateDnbRows": [],
        "competitionClassification": Counter(),
        "sourceParseWarnings": [],
    }
    matches = []
    for raw_match in source["matches"]:
        competition, competition_source = competition_for_match(
            raw_match, exact, fallback
        )
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

    (
        player_index,
        players,
        appearances,
        batting_innings,
        bowling_spells,
    ) = build_player_data(matches)
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
        compact_json(temp_path / "appearances.json", appearances)
        compact_json(temp_path / "batting-innings.json", batting_innings)
        compact_json(temp_path / "bowling-spells.json", bowling_spells)
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
