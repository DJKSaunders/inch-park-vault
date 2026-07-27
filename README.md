# Edinburgh South CC Club Records

A public statistics explorer for Edinburgh South Cricket Club. The site covers
recorded batting, bowling and fielding performances from 2004 to 2025.

## Local development

Requires Node.js 22.13 or later and pnpm.

```bash
pnpm install
pnpm run dev
pnpm run build
```

## Annual data update

Replace the source workbook, then regenerate the compact website dataset:

```bash
python scripts/export_site_data.py \
  /path/to/ESCC_records.xlsx \
  public/data/records.json
```

Run `pnpm run build` after every data refresh. The importer expects the
`Unified Records` worksheet and its existing column names.
