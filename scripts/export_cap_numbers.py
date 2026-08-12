#!/usr/bin/env python3
"""Export the audited cap-number register for the website UI."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data/cap-numbers-source.json"
DEFAULT_DIRECTORY = ROOT / "public/data/scorecards/player-directory.json"
DEFAULT_OUTPUT = ROOT / "public/data/cap-numbers.json"

PREFERRED_NAMES = {
    "srinim": "Srini Muthuraman",
}

MANUAL_ALIASES = {
    "cbarrett": "charliebarratt",
    "mreid": "markreid",
    "jackmcluckie": "jackmcluckiepettegree",
    "ajaykumarjangikiti": "ajaykumarjangiti",
    "qasimfaizan": "mqasimfaizan",
    "srinimuthuraman": "srinim",
}


def normalise(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value or "")
        .encode("ascii", "ignore")
        .decode()
        .lower()
    )
    return re.sub(r"[^a-z0-9]", "", ascii_value)


def cap_name(row: dict) -> str:
    if row.get("player"):
        return row["player"].strip()
    return f"{row.get('firstName', '')} {row.get('surname', '')}".strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    source = json.loads(args.source.read_text())
    directory = json.loads(args.directory.read_text())

    alias_index: dict[str, dict] = {}
    for player in directory["players"]:
        for alias in {player["name"], *(player.get("aliases") or [])}:
            alias_index[normalise(alias)] = player

    by_player_id: dict[str, dict] = {}
    by_name: dict[str, dict] = {}
    register = []
    unmatched = []

    rows = sorted(
        [*source["existing"], *source["continuation"]],
        key=lambda row: row["capNumber"],
    )
    for row in rows:
        name = cap_name(row)
        lookup = MANUAL_ALIASES.get(normalise(name), normalise(name))
        player = alias_index.get(lookup)
        record = {
            "capNumber": row["capNumber"],
            "name": name,
            "date": row.get("date"),
            "team": row.get("team"),
            "competition": row.get("competition"),
        }
        if not player:
            unmatched.append(record)
            register.append(record)
            continue

        display_name = PREFERRED_NAMES.get(normalise(player["name"]), player["name"])
        mapped = {
            "capNumber": row["capNumber"],
            "displayName": display_name,
            "playerId": player["playerId"],
        }
        by_player_id[player["playerId"]] = mapped
        for alias in {
            name,
            display_name,
            player["name"],
            *(player.get("aliases") or []),
        }:
            by_name[normalise(alias)] = mapped
        register.append({**record, "playerId": player["playerId"], "displayName": display_name})

    numbers = [row["capNumber"] for row in register]
    if numbers != list(range(1, len(numbers) + 1)):
        raise ValueError("Cap numbers must be continuous from 1")
    if any(row.get("team") == "Women's" for row in source["continuation"]):
        raise ValueError("Women's fixtures must not appear in the cap continuation")

    payload = {
        "schemaVersion": "1.0.0",
        "description": "Competitive Edinburgh South cap numbers, ordered by first League or Cup appearance.",
        "tooltip": "Cap number – based on when they first appeared in a competitive South fixture",
        "asOfDate": source["metadata"]["archiveThrough"],
        "capCount": len(register),
        "mappedProfileCount": len(by_player_id),
        "byPlayerId": dict(sorted(by_player_id.items())),
        "byName": dict(sorted(by_name.items())),
        "unmatched": unmatched,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(
        f"Exported {payload['capCount']} cap numbers; "
        f"mapped {payload['mappedProfileCount']} profiles; "
        f"left {len(unmatched)} historical names unmatched."
    )


if __name__ == "__main__":
    main()
