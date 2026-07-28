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

For a complete replacement workbook, regenerate the compact website dataset:

```bash
python scripts/export_site_data.py \
  /path/to/ESCC_records.xlsx \
  public/data/records.json
```

Run `pnpm run build` after every data refresh. The importer expects the
`Unified Records` worksheet and its existing column names.

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
