#!/usr/bin/env python3
"""Validate and summarise proposed internal-fixture mappings for review."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REVIEW = ROOT / "data/internal-fixture-review.json"
DEFAULT_INDEX = ROOT / "public/data/scorecards/index.json"
DEFAULT_OUTPUT = ROOT / "docs/internal-fixture-candidates.csv"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    review = json.loads(args.review.read_text())
    index = json.loads(args.index.read_text())
    matches = {row["fixtureId"]: row for row in index["matches"]}

    used_ids: dict[str, str] = {}
    output_rows = []
    for action, key in (("fuse", "fuseCandidates"), ("classify", "singleInternalCandidates")):
        for candidate in review[key]:
            fixture_ids = candidate.get("sourceFixtureIds", [])
            for fixture_id in fixture_ids:
                if fixture_id not in matches:
                    raise ValueError(f"Missing fixture {fixture_id} for {candidate['label']}")
                if matches[fixture_id]["date"] != candidate["date"]:
                    raise ValueError(f"Date mismatch for fixture {fixture_id}")
                if fixture_id in used_ids:
                    raise ValueError(f"Fixture {fixture_id} appears in two candidate groups")
                used_ids[fixture_id] = candidate["label"]
            output_rows.append(
                {
                    "action": action,
                    "date": candidate["date"],
                    "label": candidate["label"],
                    "confidence": candidate.get("confidence", "high"),
                    "source_fixture_ids": ", ".join(fixture_ids) or "aggregate records only",
                    "scratch_sides": " v ".join(candidate.get("scratchSides", [])),
                    "reason": candidate.get("reason", "Already represented by one scorecard."),
                }
            )

    internal_ids = set(used_ids)
    for control in review["externalControlCases"]:
        for fixture_id in control["sourceFixtureIds"]:
            if fixture_id not in matches:
                raise ValueError(f"Missing external control fixture {fixture_id}")
            if fixture_id in internal_ids:
                raise ValueError(f"External control fixture {fixture_id} was classified as internal")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=(
                "action",
                "date",
                "label",
                "confidence",
                "source_fixture_ids",
                "scratch_sides",
                "reason",
            ),
        )
        writer.writeheader()
        writer.writerows(output_rows)

    print(
        f"Validated {len(review['fuseCandidates'])} fuse candidates, "
        f"{len(review['singleInternalCandidates'])} single internal fixtures, and "
        f"{len(review['externalControlCases'])} external control cases."
    )
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
