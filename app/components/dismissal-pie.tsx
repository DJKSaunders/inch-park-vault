"use client";

import { useState } from "react";
import type { DismissalType } from "../statistics";

const labels: Record<DismissalType, string> = {
  caught: "Caught",
  bowled: "Bowled",
  lbw: "LBW",
  "run-out": "Run out",
  stumped: "Stumped",
  "hit-wicket": "Hit wicket",
  "retired-out": "Retired out",
  other: "Other",
};

const colours: Record<DismissalType, string> = {
  caught: "#f3c969",
  bowled: "#ef7d57",
  lbw: "#c65d7b",
  "run-out": "#48a9a6",
  stumped: "#65a3d7",
  "hit-wicket": "#9076c6",
  "retired-out": "#9d7b5f",
  other: "#87918b",
};

export function DismissalBreakdown({
  counts,
  notOuts,
  minimum = 5,
}: {
  counts: Partial<Record<DismissalType, number>>;
  notOuts: number;
  minimum?: number;
}) {
  const [excludeNotOuts, setExcludeNotOuts] = useState(false);
  const dismissalRows = (Object.keys(labels) as DismissalType[])
    .map((type) => ({
      type,
      label: labels[type],
      colour: colours[type],
      count: counts[type] ?? 0,
    }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count);
  const rows = excludeNotOuts
    ? dismissalRows
    : [
        ...dismissalRows,
        ...(notOuts > 0
          ? [{ type: "not-out", label: "Not out", colour: "#526070", count: notOuts }]
          : []),
      ];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const maximum = Math.max(...rows.map((row) => row.count), 1);

  if (total < minimum) {
    return (
      <div className="dismissal-small-sample">
        <strong>{total} recorded innings conclusions</strong>
        <p>
          A breakdown is shown after five recorded innings. {notOuts} not-out
          {notOuts === 1 ? "" : "s"} recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="dismissal-breakdown">
      <label className="dismissal-not-out-toggle">
        <input
          type="checkbox"
          checked={excludeNotOuts}
          onChange={(event) => setExcludeNotOuts(event.target.checked)}
        />
        Exclude Not Outs
      </label>
      <div className="dismissal-bar-layout">
      <div className="dismissal-bar-summary">
        <strong>{total}</strong>
        <span>innings conclusions</span>
        <small>{excludeNotOuts ? `${notOuts} not-out innings excluded` : "not-outs included"}</small>
      </div>
      <div className="dismissal-bars" role="img" aria-label={`${total} innings conclusions by type`}>
        {rows.map((row) => {
          const percent = (row.count / total) * 100;
          return (
            <div key={row.type}>
              <span>{row.label}</span>
              <div>
                <i
                  style={{
                    background: row.colour,
                    width: `${(row.count / maximum) * 100}%`,
                  }}
                />
              </div>
              <strong>{row.count}</strong>
              <small>{percent.toFixed(1)}%</small>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
