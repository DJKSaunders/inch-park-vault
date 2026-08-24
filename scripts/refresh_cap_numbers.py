#!/usr/bin/env python3
"""Continue the audited competitive cap register from refreshed scorecards."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEAM_ORDER = {"1st XI": 1, "2nd XI": 2, "3rd XI": 3, "4th XI": 4, "5th XI": 5}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def player_index(directory: dict) -> dict[str, dict]:
    return {player["playerId"]: player for player in directory["players"]}


def known_player_ids(register: dict, cap_output: dict) -> set[str]:
    by_name = cap_output.get("byName", {})
    known = set()
    for row in [*register["existing"], *register["continuation"]]:
        name = row.get("player") or f"{row.get('firstName', '')} {row.get('surname', '')}".strip()
        canonical = "".join(character for character in name.casefold() if character.isalnum())
        if canonical in by_name and by_name[canonical].get("playerId"):
            known.add(by_name[canonical]["playerId"])
        if row.get("playerId"):
            known.add(row["playerId"])
    return known


def candidates(index: dict, matches_dir: Path, directory: dict, after: str) -> list[dict]:
    players = player_index(directory)
    output = []
    for match in index["matches"]:
        if match.get("date", "") <= after or match.get("competition") not in {"League", "Cup"}:
            continue
        team = match.get("esccTeam")
        if team not in TEAM_ORDER:
            continue
        match_path = matches_dir / f"{match['fixtureId']}.json"
        if not match_path.is_file():
            continue
        card = load(match_path)
        seen = set()
        lineup = []
        for innings in card.get("innings", []):
            if innings.get("battingTeamRole") != "escc":
                continue
            for batter in innings.get("batting", []):
                player_id = batter.get("playerId")
                if not player_id or batter.get("isPlaceholder") or player_id in seen:
                    continue
                seen.add(player_id)
                lineup.append((batter.get("rowNumber") or 99, player_id))
        # Abandoned or incomplete cards can contain only an ESCC bowling list.
        # They retain a deterministic trailing position instead of silently
        # losing a legitimate competitive debut.
        for player in match.get("players", []):
            player_id = next((key for key, value in players.items() if player in {value["name"], *value.get("aliases", [])}), None)
            if player_id and player_id not in seen:
                seen.add(player_id)
                lineup.append((99 + len(lineup), player_id))
        for order, player_id in lineup:
            player = players.get(player_id)
            if not player:
                continue
            output.append({
                "player": player["name"], "playerId": player_id, "date": match["date"], "team": team,
                "opposition": match.get("opposition"), "competition": match["competition"],
                "fixtureId": match["fixtureId"], "matchNumber": match.get("matchNumber", 10**9),
                "battingOrder": order, "orderReliable": order < 99, "outcome": match.get("outcome"),
                "result": match.get("result"),
                "sequenceKey": [match["date"], TEAM_ORDER[team], match.get("matchNumber", 10**9), order],
            })
    return sorted(output, key=lambda item: item["sequenceKey"])


def refresh(source: dict, index: dict, directory: dict, cap_output: dict, matches_dir: Path, through: str) -> dict:
    known = known_player_ids(source, cap_output)
    cap = max(row["capNumber"] for row in [*source["existing"], *source["continuation"]])
    additions = []
    for candidate in candidates(index, matches_dir, directory, source["metadata"]["archiveThrough"]):
        if candidate["playerId"] in known:
            continue
        cap += 1
        candidate["capNumber"] = cap
        additions.append(candidate)
        known.add(candidate["playerId"])
    source["continuation"].extend(additions)
    source["metadata"].update({
        "archiveThrough": through,
        "newCount": len(source["continuation"]),
        "provisionalLastCap": cap,
    })
    return {"added": additions, "capCount": cap, "archiveThrough": through}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "data/cap-numbers-source.json")
    parser.add_argument("--index", type=Path, default=ROOT / "public/data/scorecards/index.json")
    parser.add_argument("--directory", type=Path, default=ROOT / "public/data/scorecards/player-directory.json")
    parser.add_argument("--cap-output", type=Path, default=ROOT / "public/data/cap-numbers.json")
    parser.add_argument("--matches-dir", type=Path, default=ROOT / "public/data/scorecards/matches")
    parser.add_argument("--records", type=Path, default=ROOT / "public/data/records.json")
    args = parser.parse_args()
    source, records = load(args.source), load(args.records)
    summary = refresh(source, load(args.index), load(args.directory), load(args.cap_output), args.matches_dir, records["meta"]["asOfDate"])
    args.source.write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
