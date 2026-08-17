import importlib.util
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).parents[1]


def module(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    loaded = importlib.util.module_from_spec(spec)
    assert spec.loader
    sys.modules[spec.name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


VALIDATOR = module("validate_update_package")
MERGER = module("merge_scorecard_archive")


class UpdateWorkflowTests(unittest.TestCase):
    def test_package_path_rejects_directories_outside_updates(self):
        with self.assertRaises(ValueError):
            VALIDATOR.package_path("public/data")

    def test_validator_counts_selected_season_rows(self):
        with TemporaryDirectory(dir=ROOT / "data" / "updates") as temporary:
            folder = Path(temporary)
            (folder / "batting.xml").write_text(
                "<Root><BattingPerfomance><FixDate>2026-08-10</FixDate></BattingPerfomance></Root>"
            )
            (folder / "bowling.xml").write_text(
                "<Root><Fixture><FixDate>2026-08-10</FixDate></Fixture></Root>"
            )
            (folder / "averages.xlsx").write_bytes(b"x" * 1024)
            result = VALIDATOR.validate(folder, 2026)
        self.assertEqual(result["battingRows"], 1)
        self.assertEqual(result["bowlingRows"], 1)

    def test_merge_replaces_only_requested_season_by_fixture_id(self):
        existing = {"meta": {"matchCount": 2}, "matches": [
            {"fixtureId": "1", "season": 2025, "date": "2025-05-01"},
            {"fixtureId": "2", "season": 2026, "date": "2026-05-01"},
        ]}
        refreshed = {"matches": [
            {"fixtureId": "2", "season": 2026, "date": "2026-05-02"},
            {"fixtureId": "3", "season": 2026, "date": "2026-06-01"},
        ]}
        output, summary = MERGER.merge(existing, refreshed, 2026)
        self.assertEqual([match["fixtureId"] for match in output["matches"]], ["1", "2", "3"])
        self.assertEqual(output["matches"][1]["date"], "2026-05-02")
        self.assertEqual(summary["replacedMatches"], 2)


if __name__ == "__main__":
    unittest.main()
