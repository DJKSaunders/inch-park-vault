# Vault scorecard integration — Phase 1

Last updated: 29 July 2026

Phase 1 prepares the scraped scorecards for safe use by the Vault. It does not
replace the existing workbook-derived career records or add public-facing
scorecard pages yet.

Current status: complete. Site version 18 was published to the public Vault on
29 July 2026.

## Progress

- [x] Preserve and back up the complete scraped archive
- [x] Confirm innings and appearance counting rules
- [x] Define the production scorecard schemas and file layout
- [x] Build the deterministic normalization and export pipeline
- [x] Generate the match search index and per-fixture files
- [x] Generate player, appearance and innings indexes
- [x] Generate provenance, coverage and data-quality reports
- [x] Validate duplicate, DNB and multi-innings handling
- [x] Run the production website build
- [x] Publish the validated Phase 1 version

## Agreed counting rules

- A player has at most one appearance per fixture.
- Every genuine batting row counts as an innings.
- Two genuine batting rows in one fixture count as two innings and one
  appearance.
- A DNB row accompanying a genuine innings is suppressed.
- A DNB-only player has one appearance and no batting innings when the team
  selection is reliable.
- Placeholder names such as `A.N. Other` are fixture- and side-specific and are
  never merged into a single career identity.
- The workbook-derived `public/data/records.json` remains authoritative during
  Phase 1.

## Intended production outputs

- Compact match-search index
- One scorecard JSON file per fixture
- Player-to-match index
- Appearance and innings indexes
- Coverage and provenance metadata
- Machine-readable data-quality report
