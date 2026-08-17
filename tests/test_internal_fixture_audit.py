import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


class InternalFixtureAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.review = json.loads((ROOT / "data/internal-fixture-review.json").read_text())
        index = json.loads((ROOT / "public/data/scorecards/index.json").read_text())
        cls.matches = {row["fixtureId"]: row for row in index["matches"]}

    def test_reviewed_fixture_ids_are_unique_and_exist(self):
        used = []
        for key in ("fuseCandidates", "singleInternalCandidates"):
            for candidate in self.review[key]:
                for fixture_id in candidate.get("sourceFixtureIds", []):
                    self.assertIn(fixture_id, self.matches)
                    self.assertEqual(self.matches[fixture_id]["date"], candidate["date"])
                    used.append(fixture_id)
        self.assertEqual(len(used), len(set(used)))

    def test_external_control_fixtures_are_not_classified_as_internal(self):
        internal_ids = {
            fixture_id
            for key in ("fuseCandidates", "singleInternalCandidates")
            for candidate in self.review[key]
            for fixture_id in candidate.get("sourceFixtureIds", [])
        }
        for control in self.review["externalControlCases"]:
            for fixture_id in control["sourceFixtureIds"]:
                self.assertIn(fixture_id, self.matches)
                self.assertNotIn(fixture_id, internal_ids)

    def test_same_day_external_friendlies_remain_separate(self):
        controls = {
            fixture_id
            for control in self.review["externalControlCases"]
            if control["date"] == "2023-05-11"
            for fixture_id in control["sourceFixtureIds"]
        }
        self.assertEqual(controls, {"837298", "858740"})
        self.assertEqual(
            {self.matches[fixture_id]["opposition"] for fixture_id in controls},
            {"E=MCC", "Eccentric Flamingoes"},
        )

    def test_aggregate_only_2026_fixture_has_named_sides(self):
        candidate = next(
            row
            for row in self.review["fuseCandidates"]
            if row["date"] == "2026-08-11"
        )
        self.assertEqual(candidate["sourceFixtureIds"], [])
        self.assertEqual(
            candidate["scratchSides"],
            ["Peter's Pirates", "Kasun's Passions"],
        )


if __name__ == "__main__":
    unittest.main()
