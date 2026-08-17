#!/usr/bin/env python3
"""Validate a small, GitHub-uploaded Vault update package before refresh."""

from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {"batting.xml", "bowling.xml", "averages.xlsx"}


def package_path(value: str) -> Path:
    path = (ROOT / value).resolve()
    updates = (ROOT / "data" / "updates").resolve()
    if updates not in path.parents or path == updates:
        raise ValueError("Update directory must be inside data/updates/")
    return path


def xml_rows(path: Path, tag: str, season: int) -> int:
    root = ET.parse(path).getroot()
    matches = 0
    for node in root.findall(tag):
        date = (node.findtext("FixDate") or "").strip()
        if date.startswith(f"{season}-"):
            matches += 1
    return matches


def validate(directory: Path, season: int) -> dict:
    missing = sorted(name for name in REQUIRED if not (directory / name).is_file())
    extra = sorted(path.name for path in directory.iterdir() if path.is_file() and path.name not in REQUIRED)
    if missing:
        raise ValueError(f"Missing required files: {', '.join(missing)}")
    batting_rows = xml_rows(directory / "batting.xml", "BattingPerfomance", season)
    bowling_rows = xml_rows(directory / "bowling.xml", "Fixture", season)
    if not batting_rows:
        raise ValueError(f"batting.xml contains no {season} batting rows")
    if not bowling_rows:
        raise ValueError(f"bowling.xml contains no {season} bowling rows")
    if (directory / "averages.xlsx").stat().st_size < 1024:
        raise ValueError("averages.xlsx is unexpectedly small")
    return {
        "updateDirectory": str(directory.relative_to(ROOT)),
        "season": season,
        "files": sorted(REQUIRED),
        "battingRows": batting_rows,
        "bowlingRows": bowling_rows,
        "ignoredExtraFiles": extra,
        "status": "valid",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = validate(package_path(args.directory), args.season)
    rendered = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
