#!/usr/bin/env python3
"""Apply approved player display names to generated public JSON without changing IDs."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"
NAMES = {
    "Kiran SV": "Kiran Sankaran",
    "Srini M": "Srini Muthuraman",
}


def rename(value):
    if isinstance(value, str):
        return NAMES.get(value, value)
    if isinstance(value, list):
        return [rename(item) for item in value]
    if isinstance(value, dict):
        return {key: rename(item) for key, item in value.items()}
    return value


def main():
    changed = 0
    for path in PUBLIC_DATA.rglob("*.json"):
        original = json.loads(path.read_text(encoding="utf-8"))
        updated = rename(original)
        if updated == original:
            continue
        path.write_text(json.dumps(updated, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
        changed += 1
    print(f"Updated {changed} generated JSON files")


if __name__ == "__main__":
    main()
