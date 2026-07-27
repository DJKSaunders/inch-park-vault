import json
import os
import sys
from datetime import date, datetime

from openpyxl import load_workbook


if len(sys.argv) != 3:
    raise SystemExit(
        "Usage: export_site_data.py <records.xlsx> <output.json>"
    )

workbook_path, output_path = sys.argv[1:]
workbook = load_workbook(workbook_path, read_only=True, data_only=True)
sheet = workbook["Unified Records"]
rows = sheet.iter_rows(values_only=True)
headers = next(rows)
index = {header: position for position, header in enumerate(headers)}


def value(row, column):
    return row[index[column]]


def number(row, column):
    candidate = value(row, column)
    return candidate if isinstance(candidate, (int, float)) else 0


def date_value(candidate):
    if isinstance(candidate, (datetime, date)):
        return candidate.isoformat()[:10]
    return candidate or ""


batting = []
bowling = []
players = set()
seasons = set()
teams = set()
match_types = set()
oppositions = set()

for row in rows:
    player = value(row, "Player Name")
    season = number(row, "Season")
    team = value(row, "Team")
    match_type = value(row, "Match Type")
    opposition = value(row, "Opposition")
    common = [
        player,
        season,
        team,
        match_type,
        opposition,
        date_value(value(row, "Date")),
    ]

    players.add(player)
    seasons.add(season)
    teams.add(team)
    match_types.add(match_type)
    oppositions.add(opposition)

    if value(row, "Record Type") == "Batting":
        batting.append(
            common
            + [
                value(row, "Batting Runs"),
                bool(value(row, "Not Out")),
                bool(value(row, "Did Not Bat")),
                number(row, "Catches"),
                number(row, "Stumpings"),
                number(row, "Run Outs"),
            ]
        )
    elif value(row, "Record Type") == "Bowling":
        bowling.append(
            common
            + [
                number(row, "Balls Bowled"),
                number(row, "Maidens"),
                number(row, "Runs Conceded"),
                number(row, "Wickets"),
            ]
        )

players = sorted(filter(None, players))
seasons = sorted(filter(None, seasons))

payload = {
    "meta": {
        "title": "Edinburgh South CC Club Records",
        "seasonStart": seasons[0],
        "seasonEnd": seasons[-1],
        "recordCount": len(batting) + len(bowling),
        "playerCount": len(players),
        "seasonCount": len(seasons),
        "teams": sorted(filter(None, teams)),
        "matchTypes": sorted(filter(None, match_types)),
        "oppositions": sorted(filter(None, oppositions)),
        "playerNames": players,
        "generatedFrom": os.path.basename(workbook_path),
    },
    "batting": batting,
    "bowling": bowling,
}

os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

print(
    json.dumps(
        {
            "outputPath": output_path,
            "bytes": os.path.getsize(output_path),
            "battingRows": len(batting),
            "bowlingRows": len(bowling),
        }
    )
)
