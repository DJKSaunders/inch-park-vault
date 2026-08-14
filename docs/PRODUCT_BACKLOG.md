# The Inch Park Vault product backlog

Last reviewed: 14 August 2026

This file is the durable record of outstanding product work. Adding an item to
the backlog does **not** authorise development or deployment. Requirements and
mockups must be agreed before implementation, and deployment requires separate
approval.

## Status definitions

- **Queued** — agreed as useful, but requirements are not yet approved.
- **Mockup required** — review one representative design before implementation.
- **Mockup approved** — the representative design is agreed; implementation is
  still pending.
- **Deferred** — intentionally retained for later consideration.
- **Blocked** — cannot progress without more data or a decision.

## Bugs

### BUG-001 — Mobile stacking and scaling

- **Status:** Queued
- Correct stacking and scaling problems observed on mobile layouts.
- Review the supplied mobile screenshot before defining the affected
  breakpoints and components.
- Add responsive regression coverage for the corrected layouts.

### BUG-002 — Sticky headers on long records tables

- **Status:** Queued
- Keep the table header visible while scrolling long tables, including the main
  Records page.
- Ensure the header remains aligned when a table scrolls horizontally on
  mobile.

### BUG-003 — Player-profile comparison link

- **Status:** Queued
- The **Compare player** link on player profiles does not open the comparison
  tool with the correct player selected.
- Preserve the selected player when navigating into the comparison view.

## Approved developments

### DATA-001 — Fused internal-friendly scorecards

- **Status:** Mockup approved
- First confirmed example: Mitres internal friendly on 11 August 2026.
- Store the event as one match rather than two opponent-facing records.
- Present it using the same structure and styling as every other Vault
  scorecard.
- Display **Edinburgh South v Edinburgh South** and use a neutral **Internal**
  result chip.
- Retain one-off scratch-team names, such as **Peter's Pirates** and **Kasun's
  Passions**, as small secondary labels.
- Include every available Edinburgh South batting, bowling and fielding
  performance from both sides.
- Count the fixture once in club match totals and once per participating player.
- Do not treat the internal result as either a club win or a club loss, and
  exclude it from club win-rate calculations.
- Preserve the winning and losing scratch sides within the individual match.

### DATA-002 — Identify historical internal fixtures

- **Status:** Queued; follows DATA-001
- Build a repeatable audit that proposes other possible internal fixtures from
  the archive.
- Use date, team, named scratch sides, player overlap and complementary batting
  and bowling records as signals.
- Require explicit confirmation before fusing ambiguous same-day matches, as
  some dates may contain festivals or multiple separate games.
- Initial candidates include Mitres records from 12 April and 4 May 2026.

## Ideas requiring a mockup

### VIS-001 — Batting-score distribution on player profiles

- **Status:** Mockup required
- Show the distribution of a player's runs across individual innings.
- Compare two approaches in one representative player profile:
  - vertical bar chart with one bar per innings;
  - heatmap showing the concentration of scores across ranges and time.
- Exclude DNB records from the distribution.
- Retain a clear visual distinction for not-outs.
- Apply the existing season, XI, match-type and opposition filters.
- Use a single mockup to choose the chart form before generating profile pages.

## Data audits

### AUDIT-001 — Jaskaran Singh wicket discrepancy

- **Status:** Blocked pending additional source evidence
- The Vault records 199 wickets while the external all-time summary reports 198.
- Retain the discrepancy rather than silently forcing either total.
- Use additional season, match or bowling-performance reports to isolate the
  rogue result.

## Deferred data projects

### DATA-003 — Pre-2004 Mitre CC career records

- **Status:** Deferred
- Incorporate the available pre-2004 batting and bowling averages without
  implying that scorecards exist for that era.
- Clearly distinguish Mitre CC-only records and players from Edinburgh South
  records.
- Preserve the agreed identity decisions:
  - N. Thomson and N Thompson are different people;
  - C. Barrett merges into Charlie Barratt;
  - I. Ahktar and Irfan Akhtar are different people;
  - the modern Derek Wright becomes Derek Wright Jnr;
  - M. Reid merges into Mark Reid.

## Infrastructure

### OPS-001 — Custom subdomain

- **Status:** Deferred
- Point the available club subdomain at the static GitHub Pages deployment.
- Retain the current near-zero-cost hosting architecture unless future dynamic
  features require a server or database.

## Backlog maintenance

When a new item is added:

1. Give it a stable identifier and status.
2. Record the user-facing outcome and known acceptance criteria.
3. Do not begin implementation solely because it appears here.
4. Move completed work out of this file as part of the implementing commit.
