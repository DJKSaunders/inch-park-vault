# Scorecard production data

The Vault's scorecard data is generated from the locally cached public
scorecards. It enriches, but does not replace, the workbook-derived career
records in `public/data/records.json`.

## Generate the production export

```bash
python3 scripts/export_scorecard_data.py
```

The command reads `data/scorecards/archive/scorecards.json` and writes the
production files to `public/data/scorecards/`.

## Counting rules

- A named player has one appearance per fixture.
- Every genuine batting row is an innings.
- Multiple genuine batting rows in one fixture are retained as multiple
  innings under the same appearance.
- A DNB row is suppressed when the same named player has a genuine innings in
  that team innings.
- Duplicate DNB-only rows collapse to one appearance with zero innings.
- Placeholder names receive fixture-local identities and never become a
  combined career record.

## Production layout

- `index.json`: compact match-search index
- `matches/{fixtureId}.json`: one normalized scorecard per fixture
- `players/index.json`: compact ESCC player index
- `players/{playerId}.json`: one ESCC player's match history
- `appearances.json`: unique player/fixture appearances
- `batting-innings.json`: retained ESCC batting innings
- `bowling-spells.json`: retained ESCC bowling spells
- `coverage.json`: field availability by season
- `data-quality.json`: normalization decisions and validation totals
- `provenance.json`: input hashes and authority boundary
- `schema.json`: machine-readable data contract

Every scorecard retains its source URL and source-page SHA-256 digest.
