#!/usr/bin/env python3
"""Merge a freshly scraped season into the checked-in compact scorecard source."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def merge(existing: dict, refreshed: dict, season: int) -> tuple[dict, dict]:
    old = [match for match in existing.get("matches", []) if match.get("season") != season]
    replacement = [match for match in refreshed.get("matches", []) if match.get("season") == season]
    by_id = {str(match["fixtureId"]): match for match in old}
    by_id.update({str(match["fixtureId"]): match for match in replacement})
    matches = sorted(by_id.values(), key=lambda match: (match.get("date") or "", str(match["fixtureId"])))
    output = dict(existing)
    output["matches"] = matches
    meta = dict(existing.get("meta", {}))
    meta.update({
        "matchCount": len(matches),
        "lastRefreshedSeason": season,
        "lastRefreshSourceCount": len(replacement),
    })
    output["meta"] = meta
    return output, {"replacedSeason": season, "replacedMatches": len(replacement), "totalMatches": len(matches)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("existing", type=Path)
    parser.add_argument("refreshed", type=Path)
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    merged, summary = merge(load(args.existing), load(args.refreshed), args.season)
    output = args.output or args.existing
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output.parent, delete=False) as handle:
        json.dump(merged, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(output)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
