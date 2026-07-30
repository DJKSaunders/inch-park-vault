#!/usr/bin/env python3
"""Apply scorecard-backed no-play rules to the compact Vault records."""

from __future__ import annotations

import json
from pathlib import Path

from records_quality import apply_administrative_no_play_rule


ROOT = Path(__file__).resolve().parents[1]
RECORDS_PATH = ROOT / "public" / "data" / "records.json"
SCORECARD_ROOT = ROOT / "public" / "data" / "scorecards"
QUALITY_PATH = ROOT / "public" / "data" / "records-quality.json"


def main() -> None:
    payload = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
    quality = apply_administrative_no_play_rule(payload, SCORECARD_ROOT)
    RECORDS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    QUALITY_PATH.write_text(
        json.dumps(quality, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({key: quality[key] for key in quality if key != "removedRows"}))


if __name__ == "__main__":
    main()
