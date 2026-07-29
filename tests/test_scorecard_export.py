import importlib.util
import sys
import unittest
from collections import defaultdict
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "export_scorecard_data.py"
SPEC = importlib.util.spec_from_file_location("export_scorecard_data", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def batter(name, runs=None, did_not_bat=False, member_id="1"):
    return {
        "player": name,
        "memberId": member_id,
        "dismissal": None if did_not_bat else "not out",
        "notOut": not did_not_bat,
        "didNotBat": did_not_bat,
        "runs": runs,
        "minutes": None,
        "balls": None,
        "fours": None,
        "sixes": None,
        "strikeRate": None,
        "catches": None,
        "stumpings": None,
        "runOuts": None,
    }


def bowler(name, balls):
    return {
        "player": name,
        "memberId": None,
        "overs": None,
        "balls": balls,
        "maidens": 0,
        "runs": 0,
        "wickets": 0,
        "average": None,
        "economy": None,
    }


class ScorecardExportTests(unittest.TestCase):
    def quality(self):
        return {
            "suppressedDnbRows": [],
            "collapsedDuplicateDnbRows": [],
        }

    def test_two_innings_are_retained_but_dnb_is_suppressed(self):
        quality = self.quality()
        rows = MODULE.normalize_batting_rows(
            [
                batter("Test Player", 20),
                batter("Test Player", 10),
                batter("Test Player", did_not_bat=True),
            ],
            "100",
            1,
            quality,
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual([row["runs"] for row in rows], [20, 10])
        self.assertEqual(len(quality["suppressedDnbRows"]), 1)

    def test_duplicate_dnb_rows_become_one_appearance_candidate(self):
        quality = self.quality()
        rows = MODULE.normalize_batting_rows(
            [
                batter("Test Player", did_not_bat=True),
                batter("Test Player", did_not_bat=True),
            ],
            "100",
            1,
            quality,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["entryType"], "did-not-bat")
        self.assertEqual(len(quality["collapsedDuplicateDnbRows"]), 1)

    def test_placeholder_rows_never_share_an_identity(self):
        quality = self.quality()
        rows = MODULE.normalize_batting_rows(
            [
                batter("A.N. Other", 8, member_id=None),
                batter("A.N. Other", 4, member_id=None),
            ],
            "100",
            1,
            quality,
        )
        self.assertNotEqual(rows[0]["playerId"], rows[1]["playerId"])
        self.assertTrue(all(row["isPlaceholder"] for row in rows))

    def test_player_builder_counts_two_innings_as_one_appearance(self):
        quality = self.quality()
        batting = MODULE.normalize_batting_rows(
            [batter("Test Player", 20), batter("Test Player", 10)],
            "100",
            1,
            quality,
        )
        for number, row in enumerate(batting, start=1):
            row["playerInningsNumberInMatch"] = number
        match = {
            "fixtureId": "100",
            "date": "2026-07-01",
            "season": 2026,
            "esccTeam": "1st XI",
            "opposition": "Visitors",
            "competition": "Friendly",
            "result": {"outcome": "win"},
            "innings": [
                {
                    "id": "100-1",
                    "battingTeamRole": "escc",
                    "bowlingTeamRole": "opponent",
                    "battingTeam": "Edinburgh South Cricket Club 1st XI",
                    "bowlingTeam": "Visitors",
                    "batting": batting,
                    "bowling": [],
                }
            ],
        }
        players, _, appearances, innings, _ = MODULE.build_player_data([match])
        self.assertEqual(len(players), 1)
        self.assertEqual(len(appearances), 1)
        self.assertEqual(len(innings), 2)
        self.assertEqual(appearances[0]["battingInningsCount"], 2)

    def test_innings_overs_are_calculated_from_bowling_balls(self):
        rows = [bowler("Bowler One", 48), bowler("Bowler Two", 32)]
        self.assertEqual(MODULE.overs_from_bowling(rows), "13.2")

    def test_innings_overs_are_not_calculated_from_incomplete_bowling(self):
        rows = [bowler("Bowler One", 48), bowler("Bowler Two", None)]
        self.assertIsNone(MODULE.overs_from_bowling(rows))

    def test_record_names_map_to_normalized_scorecard_identities(self):
        records = {
            "batting": [["Test  Player"]],
            "bowling": [["Unmatched Player"]],
        }
        players = [
            {
                "playerId": "p-test-player",
                "name": "Test Player",
                "path": "players/p-test-player.json",
                "appearanceCount": 3,
                "battingInningsCount": 2,
                "bowlingSpellCount": 1,
            }
        ]
        result = MODULE.build_records_player_map(records, players)
        self.assertEqual(
            result["players"]["Test  Player"]["playerId"], "p-test-player"
        )
        self.assertIsNone(result["players"]["Unmatched Player"])
        self.assertEqual(result["summary"]["matchedRecordPlayerCount"], 1)


if __name__ == "__main__":
    unittest.main()
