"use client";

import type { DismissalType } from "../statistics";

const categories: {
  type: DismissalType;
  label: string;
  colour: string;
}[] = [
  { type: "caught", label: "Caught", colour: "#f3c969" },
  { type: "bowled", label: "Bowled", colour: "#ef7d57" },
  { type: "lbw", label: "LBW", colour: "#c65d7b" },
  { type: "run-out", label: "Run out", colour: "#48a9a6" },
  { type: "stumped", label: "Stumped", colour: "#65a3d7" },
  { type: "hit-wicket", label: "Hit wicket", colour: "#9076c6" },
  { type: "retired-out", label: "Retired out", colour: "#9d7b5f" },
  { type: "other", label: "Other", colour: "#87918b" },
];

export function DismissalStackedBars({
  seasons,
  context,
}: {
  seasons: {
    season: number;
    counts: Partial<Record<DismissalType, number>>;
  }[];
  context?: string;
}) {
  return (
    <div className="dismissal-stack-chart">
      <div className="dismissal-stack-legend" aria-label="Dismissal types">
        {categories.map((category) => (
          <span key={category.type}>
            <i style={{ background: category.colour }} aria-hidden="true" />
            {category.label}
          </span>
        ))}
      </div>
      <div className="dismissal-stack-rows">
        {seasons.map(({ season, counts }) => {
          const total = categories.reduce(
            (sum, category) => sum + (counts[category.type] ?? 0),
            0,
          );
          return (
            <div className="dismissal-stack-row" key={season}>
              <strong>{season}</strong>
              <div
                role="group"
                aria-label={`${season}: ${categories
                  .filter((category) => (counts[category.type] ?? 0) > 0)
                  .map(
                    (category) =>
                      `${category.label} ${counts[category.type] ?? 0}`,
                  )
                  .join(", ")}`}
              >
                {categories.map((category) => {
                  const count = counts[category.type] ?? 0;
                  if (!count || !total) return null;
                  const percent = (count / total) * 100;
                  return (
                    <button
                      type="button"
                      className="dismissal-stack-segment"
                      key={category.type}
                      style={{
                        background: category.colour,
                        width: `${percent}%`,
                      }}
                      aria-label={`${season}, ${category.label}: ${count}, ${percent.toFixed(1)}% of ${total} dismissals`}
                    >
                      {percent >= 6 && (
                        <span className="dismissal-stack-percent">
                          {percent.toFixed(0)}%
                        </span>
                      )}
                      <span className="dismissal-stack-tooltip" role="tooltip">
                        <strong>{season} · {category.label}</strong>
                        <span>{count} dismissals · {percent.toFixed(1)}%</span>
                        <small>{total} recorded dismissals that season</small>
                        {context && <small>{context}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <small>{total}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
