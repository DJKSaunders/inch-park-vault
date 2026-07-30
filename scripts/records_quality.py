"""Quality rules shared by the authoritative Vault records export."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def administrative_fixture_keys(scorecard_root: Path) -> dict[tuple, dict]:
    quality_path = scorecard_root / "data-quality.json"
    if not quality_path.exists():
        return {}
    quality = json.loads(quality_path.read_text(encoding="utf-8"))
    keys = {}
    for decision in quality.get("suppressedAdministrativeFixtures", []):
        fixture_id = decision["fixtureId"]
        match_path = scorecard_root / "matches" / f"{fixture_id}.json"
        if not match_path.exists():
            continue
        match = json.loads(match_path.read_text(encoding="utf-8"))
        key = (
            match["date"],
            match.get("esccTeam"),
            match.get("opposition"),
        )
        keys[key] = {
            "fixtureId": fixture_id,
            "date": match["date"],
            "team": match.get("esccTeam"),
            "opposition": match.get("opposition"),
            "result": match["result"]["summary"],
        }
    return keys


def apply_administrative_no_play_rule(
    payload: dict[str, Any], scorecard_root: Path
) -> dict[str, Any]:
    """Remove player rows belonging to fixtures awarded without play."""

    fixtures = administrative_fixture_keys(scorecard_root)
    removed = []
    for discipline in ("batting", "bowling"):
        retained = []
        for row in payload[discipline]:
            key = (row[5], row[2], row[4])
            fixture = fixtures.get(key)
            if fixture:
                removed.append(
                    {
                        **fixture,
                        "discipline": discipline,
                        "player": row[0],
                    }
                )
            else:
                retained.append(row)
        payload[discipline] = retained

    remaining_rows = payload["batting"] + payload["bowling"]
    players = sorted({row[0] for row in remaining_rows if row[0]})
    payload["meta"]["recordCount"] = len(remaining_rows)
    payload["meta"]["playerCount"] = len(players)
    payload["meta"]["playerNames"] = players
    return {
        "rule": "concession-forfeit-or-walkover",
        "fixtureCount": len(fixtures),
        "removedRowCount": len(removed),
        "removedPlayerCount": len({row["player"] for row in removed}),
        "removedRows": removed,
    }
