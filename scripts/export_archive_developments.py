#!/usr/bin/env python3
"""Build compact datasets for team, season, streak and achievement views."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"
TEAMS = ["1st XI", "2nd XI", "3rd XI", "4th XI", "5th XI"]
PERFORMANCE_TEAMS = [*TEAMS, "Mitres", "Women's"]


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


def team_match_records(matches, team):
    team_matches = [match for match in matches if match.get("esccTeam") == team]
    innings = []
    wins_by_runs = []
    wins_by_wickets = []
    for match in team_matches:
        south_scores = [score for score in match.get("scores", []) if "edinburgh south" in score.get("team", "").casefold()]
        for score in south_scores:
            innings.append({
                "value": score.get("runs", 0),
                "wickets": score.get("wickets"),
                "fixtureId": match["fixtureId"],
                "date": match["date"],
                "opposition": match["opposition"],
            })
        if match.get("outcome") != "win":
            continue
        result = match.get("result", "")
        run_margin = re.search(r"(?:by\s+)?(\d+)\s+runs?\b", result, re.I)
        wicket_margin = re.search(r"(?:by\s+)?(\d+)\s+wickets?\b", result, re.I)
        base = {"fixtureId": match["fixtureId"], "date": match["date"], "opposition": match["opposition"]}
        if run_margin:
            wins_by_runs.append({**base, "value": int(run_margin.group(1))})
        if wicket_margin:
            wins_by_wickets.append({**base, "value": int(wicket_margin.group(1))})

    def maximum(rows):
        return max(rows, key=lambda item: (item["value"], item["date"]), default=None)

    all_out = [row for row in innings if row.get("wickets") == 10]
    lowest_pool = all_out or innings
    return {
        "highestTotal": maximum(innings),
        "lowestTotal": min(lowest_pool, key=lambda item: (item["value"], item["date"]), default=None),
        "largestWinRuns": maximum(wins_by_runs),
        "largestWinWickets": maximum(wins_by_wickets),
    }


def multi_xi_achievements(batting, bowling, player_ids):
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
            def values_for(player):
                if key == "appearance":
                    return {team: len({(row[5], row[4]) for row in batting if row[0] == player and row[2] == team}) for team in TEAMS}
                source = wickets if key in ("wicket", "ten-wickets") else runs
                return {team: source[player][team] for team in TEAMS}

            result.append({
                "key": key,
                "label": label,
                "complete": [
                    {"player": player, "playerId": player_ids.get(player), "values": values_for(player)}
                    for player in sorted(complete)
                ],
                "close": [
                    {**item, "playerId": player_ids.get(item["player"]), "values": values_for(item["player"])}
                    for item in sorted(close, key=lambda item: item["player"])
                ],
            })
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

    alias_to_id = {
        " ".join(alias.casefold().split()): player["playerId"]
        for player in directory["players"]
        for alias in player["aliases"]
    }
    player_stats = defaultdict(lambda: {"innings": 0, "runs": 0, "outs": 0, "bowlingRuns": 0, "wickets": 0})
    for row in records["batting"]:
        player_id = alias_to_id.get(" ".join(row[0].casefold().split()))
        if not player_id:
            continue
        player_stats[player_id]["runs"] += row[6] or 0
        if not row[8]:
            player_stats[player_id]["innings"] += 1
            if not row[7]:
                player_stats[player_id]["outs"] += 1
    for row in records["bowling"]:
        player_id = alias_to_id.get(" ".join(row[0].casefold().split()))
        if not player_id:
            continue
        player_stats[player_id]["bowlingRuns"] += row[8] or 0
        player_stats[player_id]["wickets"] += row[9] or 0

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
        "personalBests": {
            "battingStrikeRate": sorted((row for row in batting_innings if (row.get("balls") or 0) >= 20 and row.get("strikeRate") is not None), key=lambda row: (-row["strikeRate"], -row["runs"]))[:10],
            "bowlingEconomy": sorted((row for row in bowling_spells if (row.get("balls") or 0) >= 18 and row.get("economy") is not None), key=lambda row: (row["economy"], -row["wickets"]))[:10],
            "bowlingStrikeRate": sorted(({**row, "strikeRate": round(row["balls"] / row["wickets"], 2)} for row in bowling_spells if (row.get("wickets") or 0) >= 2 and row.get("balls")), key=lambda row: (row["strikeRate"], -row["wickets"]))[:10],
        },
        "teamPerformances": {
            team: {
                "batting": [
                    {key: row.get(key) for key in ("date", "fixtureId", "player", "playerId", "runs", "notOut", "balls", "team", "opposition")}
                    for row in sorted(
                        (item for item in batting_innings if item.get("team") == team and item.get("runs") is not None),
                        key=lambda item: (-(item.get("runs") or 0), item.get("balls") or 10**9, item["date"]),
                    )[:100]
                ],
                "bowling": [
                    {key: row.get(key) for key in ("date", "fixtureId", "player", "playerId", "wickets", "runs", "balls", "overs", "team", "opposition")}
                    for row in sorted(
                        (item for item in bowling_spells if item.get("team") == team and (item.get("wickets") or 0) > 0),
                        key=lambda item: (-(item.get("wickets") or 0), item.get("runs") or 0, item["date"]),
                    )[:100]
                ],
                "team": team_match_records(matches, team),
            }
            for team in PERFORMANCE_TEAMS
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
    output["similarityPlayers"] = []
    for player in directory["players"]:
        stats = player_stats[player["playerId"]]
        if player["career"]["appearances"] < 20 or latest_by_player[player["playerId"]] < active_cutoff:
            continue
        batting_average = stats["runs"] / stats["outs"] if stats["outs"] else None
        bowling_average = stats["bowlingRuns"] / stats["wickets"] if stats["wickets"] else None
        qualifies_allrounder = stats["innings"] >= 20 and stats["wickets"] >= 20 and batting_average is not None and batting_average >= 15 and bowling_average is not None and bowling_average <= 30
        qualifies_batter = stats["innings"] >= 20 and batting_average is not None and batting_average >= 18
        qualifies_bowler = stats["wickets"] >= 20 and bowling_average is not None and bowling_average <= 30
        role = "allrounder" if qualifies_allrounder else "batter" if qualifies_batter else "bowler" if qualifies_bowler else None
        if not role:
            continue
        output["similarityPlayers"].append({
            "playerId": player["playerId"],
            "name": player["name"],
            "appearances": player["career"]["appearances"],
            "innings": stats["innings"],
            "runs": stats["runs"],
            "outs": stats["outs"],
            "battingAverage": round(batting_average, 2) if batting_average is not None else None,
            "wickets": stats["wickets"],
            "bowlingRuns": stats["bowlingRuns"],
            "bowlingAverage": round(bowling_average, 2) if bowling_average is not None else None,
            "role": role,
        })
    high = -1
    for row in sorted(batting_innings, key=lambda item: (item["date"], item["fixtureId"])):
        if (row.get("runs") or 0) > high:
            high = row["runs"]
            output["recordProgression"]["highestScore"].append({key: row[key] for key in ("date", "fixtureId", "player", "runs", "notOut", "team", "opposition")})
    best = (-1, 10**9)
    for row in sorted(bowling_spells, key=lambda item: (item["date"], item["fixtureId"])):
        if (row.get("wickets") or 0) < 1:
            continue
        figure = (row.get("wickets") or 0, -(row.get("runs") or 0))
        if figure > best:
            best = figure
            output["recordProgression"]["bestBowling"].append({key: row[key] for key in ("date", "fixtureId", "player", "wickets", "runs", "team", "opposition")})
    (PUBLIC / "archive-developments.json").write_text(json.dumps(output, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
