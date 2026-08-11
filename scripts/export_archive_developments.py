#!/usr/bin/env python3
"""Build compact datasets for team, season, streak and achievement views."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"
TEAMS = ["1st XI", "2nd XI", "3rd XI", "4th XI", "5th XI"]


def load(path: Path):
    return json.loads(path.read_text())


def leaders(rows, value_index, limit=10):
    totals = defaultdict(int)
    for row in rows:
        totals[row[0]] += row[value_index] or 0
    return [
        {"player": player, "value": value}
        for player, value in sorted(totals.items(), key=lambda item: (-item[1], item[0]))[:limit]
        if value > 0
    ]


def result_summary(matches):
    outcomes = defaultdict(int)
    for match in matches:
        outcomes[match["outcome"]] += 1
    played = sum(outcomes.values())
    completed = outcomes["win"] + outcomes["loss"] + outcomes["tie"] + outcomes["draw"]
    return {
        "played": played,
        "won": outcomes["win"],
        "lost": outcomes["loss"],
        "tied": outcomes["tie"],
        "drawn": outcomes["draw"],
        "abandoned": outcomes["abandoned"],
        "winPercentage": round(outcomes["win"] * 100 / completed, 1) if completed else None,
    }


def performance_streaks(rows, thresholds, value_field):
    by_player = defaultdict(list)
    for row in rows:
        by_player[row["player"]].append(row)
    output = {}
    for threshold in thresholds:
        records = []
        for player, performances in by_player.items():
            current = best = 0
            start = best_start = best_end = None
            for performance in sorted(performances, key=lambda item: (item["date"], item["fixtureId"])):
                value = performance.get(value_field) or 0
                if value >= threshold:
                    if current == 0:
                        start = performance["date"]
                    current += 1
                    if current > best:
                        best, best_start, best_end = current, start, performance["date"]
                else:
                    current = 0
            if best:
                records.append({"player": player, "length": best, "from": best_start, "to": best_end})
        output[str(threshold)] = sorted(records, key=lambda item: (-item["length"], item["player"]))[:10]
    return output


def multi_xi_achievements(batting, bowling):
    appearances = defaultdict(set)
    runs = defaultdict(lambda: defaultdict(int))
    wickets = defaultdict(lambda: defaultdict(int))
    for row in batting:
        if row[2] in TEAMS:
            appearances[row[0]].add(row[2])
            runs[row[0]][row[2]] += row[6] or 0
    for row in bowling:
        if row[2] in TEAMS:
            appearances[row[0]].add(row[2])
            wickets[row[0]][row[2]] += row[9] or 0
    definitions = [
        ("appearance", "Appeared for every XI", lambda player, team: team in appearances[player]),
        ("run", "Scored a run for every XI", lambda player, team: runs[player][team] >= 1),
        ("wicket", "Taken a wicket for every XI", lambda player, team: wickets[player][team] >= 1),
        ("fifty-runs", "Scored 50 runs for every XI", lambda player, team: runs[player][team] >= 50),
        ("ten-wickets", "Taken 10 wickets for every XI", lambda player, team: wickets[player][team] >= 10),
    ]
    players = set(appearances) | set(runs) | set(wickets)
    result = []
    for key, label, qualifies in definitions:
        complete, close = [], []
        for player in players:
            passed = [team for team in TEAMS if qualifies(player, team)]
            if len(passed) == 5:
                complete.append(player)
            elif len(passed) == 4:
                close.append({"player": player, "missing": next(team for team in TEAMS if team not in passed)})
        if complete or len(close) >= 3:
            result.append({"key": key, "label": label, "complete": sorted(complete), "close": sorted(close, key=lambda item: item["player"])})
    return result


def main():
    records = load(PUBLIC / "records.json")
    index = load(PUBLIC / "scorecards" / "index.json")
    batting_innings = load(PUBLIC / "scorecards" / "batting-innings.json")
    bowling_spells = load(PUBLIC / "scorecards" / "bowling-spells.json")
    coverage = load(PUBLIC / "scorecards" / "coverage.json")
    directory = load(PUBLIC / "scorecards" / "player-directory.json")
    appearances_data = load(PUBLIC / "scorecards" / "appearances.json")
    matches = index["matches"]

    team_summaries = []
    for team in TEAMS:
        team_matches = [match for match in matches if match.get("esccTeam") == team]
        team_batting = [row for row in records["batting"] if row[2] == team]
        team_bowling = [row for row in records["bowling"] if row[2] == team]
        team_summaries.append({"team": team, **result_summary(team_matches), "runLeaders": leaders(team_batting, 6, 100), "wicketLeaders": leaders(team_bowling, 9, 100)})

    seasons = []
    for season in range(records["meta"]["seasonStart"], records["meta"]["seasonEnd"] + 1):
        season_matches = [match for match in matches if match["season"] == season]
        season_batting = [row for row in records["batting"] if row[1] == season]
        season_bowling = [row for row in records["bowling"] if row[1] == season]
        seasons.append({"season": season, **result_summary(season_matches), "runs": sum((row[6] or 0) for row in season_batting if not row[8]), "wickets": sum((row[9] or 0) for row in season_bowling), "runLeaders": leaders(season_batting, 6, 100), "wicketLeaders": leaders(season_bowling, 9, 100)})

    output = {
        "asOfDate": records["meta"]["asOfDate"],
        "teams": team_summaries,
        "seasons": seasons,
        "streaks": {
            "batting": performance_streaks(batting_innings, [20, 30, 50, 100], "runs"),
            "bowling": performance_streaks(bowling_spells, [1, 2], "wickets"),
        },
        "multiXiAchievements": multi_xi_achievements(records["batting"], records["bowling"]),
        "personalBests": {
            "battingStrikeRate": sorted((row for row in batting_innings if (row.get("balls") or 0) >= 20 and row.get("strikeRate") is not None), key=lambda row: (-row["strikeRate"], -row["runs"]))[:10],
            "bowlingEconomy": sorted((row for row in bowling_spells if (row.get("balls") or 0) >= 18 and row.get("economy") is not None), key=lambda row: (row["economy"], -row["wickets"]))[:10],
            "bowlingStrikeRate": sorted(({**row, "strikeRate": round(row["balls"] / row["wickets"], 2)} for row in bowling_spells if (row.get("wickets") or 0) >= 2 and row.get("balls")), key=lambda row: (row["strikeRate"], -row["wickets"]))[:10],
        },
        "recordProgression": {
            "highestScore": [],
            "bestBowling": [],
        },
        "coverage": coverage,
    }
    latest_by_player = defaultdict(str)
    for appearance in appearances_data:
        latest_by_player[appearance["playerId"]] = max(latest_by_player[appearance["playerId"]], appearance["date"])
    active_cutoff = (date.fromisoformat(records["meta"]["asOfDate"]) - timedelta(days=183)).isoformat()
    output["similarityPlayers"] = [
        {"playerId": player["playerId"], "name": player["name"], **player["career"], "runsPerAppearance": round(player["career"]["runs"] / player["career"]["appearances"], 2), "wicketsPerAppearance": round(player["career"]["wickets"] / player["career"]["appearances"], 2)}
        for player in directory["players"]
        if player["career"]["appearances"] >= 20 and latest_by_player[player["playerId"]] >= active_cutoff
    ]
    high = -1
    for row in sorted(batting_innings, key=lambda item: (item["date"], item["fixtureId"])):
        if (row.get("runs") or 0) > high:
            high = row["runs"]
            output["recordProgression"]["highestScore"].append({key: row[key] for key in ("date", "fixtureId", "player", "runs", "notOut", "team", "opposition")})
    best = (-1, 10**9)
    for row in sorted(bowling_spells, key=lambda item: (item["date"], item["fixtureId"])):
        figure = (row.get("wickets") or 0, -(row.get("runs") or 0))
        if figure > best:
            best = figure
            output["recordProgression"]["bestBowling"].append({key: row[key] for key in ("date", "fixtureId", "player", "wickets", "runs", "team", "opposition")})
    (PUBLIC / "archive-developments.json").write_text(json.dumps(output, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
