# Vault update packages

This folder is the hand-off point for a routine Vault refresh. Create one dated
folder for each upload, for example `data/updates/2026-08-17/`, and upload
these three source exports from the club website:

- `batting.xml` — cumulative batting export for the selected season
- `bowling.xml` — cumulative bowling export for the selected season
- `averages.xlsx` — current all-time averages workbook (used for fours/sixes)

Then open **Actions → Refresh Vault data → Run workflow** on GitHub. Enter the
folder path and season, leave **Apply changes** off for the first run, review
the generated report, then run it again with **Apply changes** on.

The action is deliberately two-stage. It will never silently publish a source
file that has not first passed the same checks used by the site.

Do not put passwords, private member data, or raw HTML scorecard caches here.
