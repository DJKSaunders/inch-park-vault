import importlib.util
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


SCRIPT = Path(__file__).parents[1] / "scripts" / "refresh_records_snapshot.py"
SPEC = importlib.util.spec_from_file_location("refresh_records_snapshot", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class RecordsSnapshotRefreshTests(unittest.TestCase):
    def write_batting(self, body):
        temporary = TemporaryDirectory()
        path = Path(temporary.name) / "batting.xml"
        path.write_text(
            f"<Root>{body}</Root>",
            encoding="utf-8",
        )
        self.addCleanup(temporary.cleanup)
        return path

    def row(self, score, catches=0, innings=1, team="1st XI"):
        return f"""
        <BattingPerfomance>
          <FirstName>Test</FirstName><Surname>Player</Surname>
          <FixDate>2026-08-01T00:00:00+01:00</FixDate>
          <TeamName>{team}</TeamName><Opposition>Visitors</Opposition>
          <Type_Desc>League</Type_Desc><innings>{innings}</innings>
          <Score>{score}</Score><notout>{str(score == 'DNB').lower()}</notout>
          <catches>{catches}</catches><stumpings>0</stumpings><runouts>0</runouts>
        </BattingPerfomance>
        """

    def test_scored_innings_suppresses_dnb_and_preserves_fielding(self):
        path = self.write_batting(self.row("25") + self.row("DNB", catches=2))
        rows, quality = MODULE.parse_batting_snapshot(path, 2026)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][6], 25)
        self.assertEqual(rows[0][9], 2)
        self.assertEqual(len(quality["suppressedDnbRows"]), 1)

    def test_two_innings_are_retained_but_fielding_is_counted_once(self):
        path = self.write_batting(
            self.row("25", catches=1, innings=1)
            + self.row("10", catches=1, innings=2)
        )
        rows, quality = MODULE.parse_batting_snapshot(path, 2026)
        self.assertEqual([row[6] for row in rows], [25, 10])
        self.assertEqual(sum(row[9] for row in rows), 1)
        self.assertEqual(len(quality["multipleBattingInnings"]), 1)

    def test_duplicate_dnb_rows_collapse_and_merge_fielding(self):
        path = self.write_batting(self.row("DNB") + self.row("DNB", catches=1))
        rows, quality = MODULE.parse_batting_snapshot(path, 2026)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0][8])
        self.assertEqual(rows[0][9], 1)
        self.assertEqual(len(quality["collapsedDuplicateDnbRows"]), 1)

    def test_mitres_league_source_rows_are_treated_as_friendlies(self):
        path = self.write_batting(self.row("25", team="Mitres"))
        rows, _ = MODULE.parse_batting_snapshot(path, 2026)
        self.assertEqual(rows[0][3], "Friendly")

    def test_refresh_replaces_season_and_is_idempotent(self):
        payload = {
            "meta": {},
            "batting": [
                ["Old", 2025, "1st XI", "League", "A", "2025-01-01", 1, False, False, 0, 0, 0],
                ["Stale", 2026, "1st XI", "League", "B", "2026-01-01", 2, False, False, 0, 0, 0],
            ],
            "bowling": [],
            "boundaries": [["Stale", 99, 99]],
        }
        new_batting = [
            ["New", 2026, "2nd XI", "Cup", "C", "2026-08-01", 3, False, False, 0, 0, 0]
        ]
        first = MODULE.refresh_payload(payload, 2026, new_batting, [], [["New", 4, 1]])
        second = MODULE.refresh_payload(first, 2026, new_batting, [], [["New", 4, 1]])
        self.assertEqual(second["batting"], [payload["batting"][0], new_batting[0]])
        self.assertEqual(second["boundaries"], [["New", 4, 1]])
        self.assertEqual(second["meta"]["asOfDate"], "2026-08-01")

    def test_refresh_corrects_historical_mitres_league_rows(self):
        payload = {
            "meta": {},
            "batting": [
                ["Player", 2025, "Mitres", "League", "A", "2025-01-01", 1, False, False, 0, 0, 0]
            ],
            "bowling": [],
            "boundaries": [],
        }
        refreshed = MODULE.refresh_payload(payload, 2026, [], [], [])
        self.assertEqual(refreshed["batting"][0][3], "Friendly")


if __name__ == "__main__":
    unittest.main()
