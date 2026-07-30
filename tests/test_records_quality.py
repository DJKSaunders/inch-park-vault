import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from scripts.records_quality import apply_administrative_no_play_rule


class RecordsQualityTests(unittest.TestCase):
    def test_administrative_fixture_rows_are_removed(self):
        payload = {
            "meta": {
                "recordCount": 2,
                "playerCount": 2,
                "playerNames": ["Played", "Selected"],
            },
            "batting": [
                [
                    "Selected",
                    2026,
                    "1st XI",
                    "League",
                    "Visitors",
                    "2026-06-01",
                    None,
                    False,
                    True,
                    0,
                    0,
                    0,
                ],
                [
                    "Played",
                    2026,
                    "1st XI",
                    "League",
                    "Other",
                    "2026-06-02",
                    10,
                    False,
                    False,
                    0,
                    0,
                    0,
                ],
            ],
            "bowling": [],
        }
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "matches").mkdir()
            (root / "data-quality.json").write_text(
                '{"suppressedAdministrativeFixtures":[{"fixtureId":"1"}]}'
            )
            (root / "matches" / "1.json").write_text(
                '{"date":"2026-06-01","esccTeam":"1st XI",'
                '"opposition":"Visitors","result":{"summary":"Won by forfeit"}}'
            )
            quality = apply_administrative_no_play_rule(payload, root)

        self.assertEqual(quality["removedRowCount"], 1)
        self.assertEqual(payload["meta"]["recordCount"], 1)
        self.assertEqual(payload["meta"]["playerNames"], ["Played"])
        self.assertEqual(payload["batting"][0][0], "Played")


if __name__ == "__main__":
    unittest.main()
