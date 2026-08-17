# Internal-friendly scorecard and filtering proposal

## Data model

Internal fixtures should be identified through an explicit registry, not by a
broad rule applied to all Mitres friendlies.

Each fused match would retain:

- one stable Vault match ID;
- `fixtureScope: "internal"`;
- `outcome: "internal"` for club-level presentation;
- the winning and losing scratch sides within the match;
- optional `scratchSides` labels;
- every source fixture ID and aggregate source alias;
- one appearance per player and all available performances.

The match counts once in club fixture totals. It does not add a club win or
loss and is excluded from club win-rate denominators. The result between the
two scratch sides remains visible on the scorecard.

## User filtering

Add a **Fixture scope** control wherever match-level data is filtered:

- **All fixtures** — default; includes external and internal fixtures.
- **External opposition** — removes South v South fixtures.
- **Internal only** — shows intra-club and scratch-team matches.

This is clearer than making users select every result except `Internal`.

The Match Archive can also expose **Internal** in its existing Result dropdown,
but Fixture scope should be the consistent cross-site control for Records,
Insights and VaultGuru. An active non-default scope should appear as a removable
filter chip.

## Safeguards for legitimate Mitres friendlies

The system must not infer that a fixture is internal because:

- the Edinburgh South team is Mitres;
- the match type is Friendly;
- two Mitres fixtures occur on the same day; or
- an opponent fields several XIs.

A match becomes internal only when it is present in the reviewed registry. The
audit includes external control cases against E=MCC, Eccentric Flamingoes,
Carlton and Boroughmuir; validation fails if any of these IDs enter an internal
group.

The two matches on 11 May 2023 against E=MCC and Eccentric Flamingoes are an
important same-day control: they remain two legitimate external friendlies.

## Implementation sequence after approval

1. Approve or amend the candidate registry.
2. Add `fixtureScope`, scratch-side metadata and source-ID provenance.
3. Fuse the approved mirrored scorecards during export.
4. Generate aggregate-only synthetic scorecards where source scorecards are
   unavailable, beginning with 11 August 2026.
5. Add the neutral Internal chip and Fixture scope controls.
6. Recalculate match totals, appearances and club win rates.
7. Add regression tests covering every external control case.
