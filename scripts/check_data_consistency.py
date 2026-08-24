#!/usr/bin/env python3
"""Fail a refresh if any user-facing dataset was built from different records."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    records_path = PUBLIC / "records.json"
    as_of = load(records_path)["meta"]["asOfDate"]
    archive = load(PUBLIC / "archive-developments.json")
    milestones = load(PUBLIC / "scorecards" / "milestones.json")
    caps = load(PUBLIC / "cap-numbers.json")
    provenance = load(PUBLIC / "scorecards" / "provenance.json")
    index = load(PUBLIC / "scorecards" / "index.json")
    errors = []
    for label, value in {"archive developments": archive.get("asOfDate"), "milestones": milestones.get("asOfDate"), "cap numbers": caps.get("asOfDate")}.items():
        if value != as_of:
            errors.append(f"{label} is through {value}, expected {as_of}")
    digest = hashlib.sha256(records_path.read_bytes()).hexdigest()
    if provenance.get("careerRecordsSha256") != digest:
        errors.append("scorecard enrichment was not rebuilt from the current records")
    latest_match = max((match.get("date", "") for match in index.get("matches", [])), default="")
    if latest_match < as_of:
        errors.append(f"scorecard archive is through {latest_match}, expected at least {as_of}")
    if errors:
        raise SystemExit("Data consistency check failed:\n- " + "\n- ".join(errors))
    print(json.dumps({"status": "consistent", "asOfDate": as_of, "latestScorecard": latest_match}, indent=2))


if __name__ == "__main__":
    main()
