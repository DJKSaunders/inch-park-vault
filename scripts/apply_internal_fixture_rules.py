#!/usr/bin/env python3
"""Classify approved intra-club fixtures as the Internal team in Vault records."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def signature(date: str, team: str, opposition: str) -> tuple[str, str, str]:
    compact = lambda value: re.sub(r"[^a-z0-9]+", "", value.casefold())
    return date, compact(team), compact(opposition)


def approved_signatures(index: dict[str, Any], review: dict[str, Any]) -> set[tuple[str, str, str]]:
    fixture_ids = {
        fixture_id
        for section in ("fuseCandidates", "singleInternalCandidates")
        for candidate in review[section]
        for fixture_id in candidate.get("sourceFixtureIds", [])
    }
    return {
        signature(match["date"], match["esccTeam"], match["opposition"])
        for match in index["matches"]
        if match["fixtureId"] in fixture_ids and match.get("esccTeam")
    }


def apply_rules(payload: dict[str, Any], signatures: set[tuple[str, str, str]]) -> int:
    changed = 0
    for row in payload["batting"] + payload["bowling"]:
        if signature(row[5], row[2], row[4]) in signatures and row[2] != "Internal":
            row[2] = "Internal"
            changed += 1
    payload["meta"]["teams"] = sorted({row[2] for row in payload["batting"] + payload["bowling"] if row[2]})
    return changed


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary_name, path)
    except Exception:
        Path(temporary_name).unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("records", type=Path, nargs="?", default=ROOT / "public/data/records.json")
    parser.add_argument("--index", type=Path, default=ROOT / "public/data/scorecards/index.json")
    parser.add_argument("--review", type=Path, default=ROOT / "data/internal-fixture-review.json")
    args = parser.parse_args()
    payload = json.loads(args.records.read_text())
    changed = apply_rules(payload, approved_signatures(json.loads(args.index.read_text()), json.loads(args.review.read_text())))
    atomic_write(args.records, payload)
    print(json.dumps({"records": str(args.records), "rowsClassifiedInternal": changed}, indent=2))


if __name__ == "__main__":
    main()
