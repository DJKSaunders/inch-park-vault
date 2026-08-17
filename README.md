# Edinburgh South CC Club Records

A public statistics explorer for Edinburgh South Cricket Club. The site covers
recorded batting, bowling and fielding performances from 2004 onwards.

## Local development

Requires Node.js 22.13 or later and pnpm.

```bash
pnpm install
pnpm run dev
pnpm run build
```

## Annual data update

### Routine updates without Codex

The normal operational route is **GitHub → Actions → Refresh Vault data**.
Upload the three exports to a dated folder in [`data/updates`](data/updates/README.md),
run the action once with **Apply changes** off, inspect its downloadable report,
then rerun it with **Apply changes** on. It refreshes the selected season,
optionally scrapes only that season's public scorecards, runs the tests, commits
the resulting static data and lets the existing Pages deployment publish it.

This needs no database, paid backend or running Mac. The full scorecard archive
is retained in compact parsed form so a new season can be merged without
re-scraping the historic archive.

For a complete replacement workbook, regenerate the compact website dataset:

```bash
python scripts/export_site_data.py \
  /path/to/ESCC_records.xlsx \
  public/data/records.json
```

Run `pnpm run build` after every data refresh. The importer expects the
`Unified Records` worksheet and its existing column names. When the scorecard
quality index is present, fixtures decided by concession, forfeit or walkover
are retained as results but their team-sheet rows are automatically excluded
from player records.

To append the latest season before it is folded into the main records workbook,
provide the batting XML, bowling XML and season averages workbook:

```bash
python scripts/export_site_data.py \
  /path/to/ESCC_records_through_previous_season.xlsx \
  public/data/records.json \
  /path/to/latest_batting.xml \
  /path/to/latest_bowling.xml \
  /path/to/latest_averages.xlsx
```

The archive's “Stats as of” date is set automatically from the newest match in
the uploaded records. The season averages workbook supplies fours and sixes.

When the website already contains the previous snapshot for the current season,
replace that season from a new cumulative XML export rather than appending it:

```bash
python3 scripts/refresh_records_snapshot.py \
  public/data/records.json \
  /path/to/latest_batting.xml \
  /path/to/latest_bowling.xml \
  /path/to/all_time_averages.xlsx \
  --season 2026
```

This command is safe to rerun with the same inputs. It replaces the selected
season, replaces cumulative all-time boundary totals, suppresses DNB rows when
the same player has a recorded innings, collapses duplicate DNB rows, and
applies the scorecard-backed no-play rules. It writes its reconciliation details
to `public/data/records-quality.json`.

## Scorecard enrichment pilot

Public scorecards can be cached and parsed into a separate, non-authoritative
dataset without changing `public/data/records.json`:

```bash
python3 scripts/scrape_scorecards.py
```

The default pilot samples five scorecards from 2004, 2010, 2016, 2022 and 2026.
It writes structured scorecards, coverage, player matching and discrepancy
reports to `data/scorecards/pilot/`. Original HTML is retained under the
gitignored `data/scorecards/cache/` directory so interrupted work is resumable.

After reviewing the pilot reports, a complete run can be started with:

```bash
python3 scripts/scrape_scorecards.py \
  --all-seasons \
  --sample-per-season 0 \
  --output-dir data/scorecards/archive
```

The collector identifies itself, rate-limits requests, retries temporary
failures and never overwrites the workbook-derived archive.

## Production scorecard data

Generate the website-ready, fixture-split scorecard dataset after refreshing
the scraped archive:

```bash
python3 scripts/export_scorecard_data.py
```

This writes a compact match index, one JSON file per fixture, player histories,
appearance and innings indexes, coverage metadata and a data-quality report to
`public/data/scorecards/`. The existing `public/data/records.json` remains
authoritative. See `docs/scorecard-data.md` for the schema and counting rules.

If scorecard result classifications change after the main records export, apply
the same no-play rules to the existing compact dataset and then regenerate the
scorecard enrichment:

```bash
python3 scripts/apply_records_quality_rules.py
python3 scripts/export_scorecard_data.py
```

`data/scorecards/competition-overrides.json` preserves reviewed fixture
classifications when a no-play result has no remaining performance row from
which to infer its competition.
