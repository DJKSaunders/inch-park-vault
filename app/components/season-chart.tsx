"use client";

import { useState } from "react";

type ChartPoint = {
  season: number;
  value: number;
  display: string;
  valueLabel?: string;
  details?: string[];
};

type SeasonChartProps = {
  label: string;
  points: ChartPoint[];
  note?: string;
  context?: string;
  direction?: "higher" | "lower" | "neutral";
};

const integer = new Intl.NumberFormat("en-GB");

export function SeasonChart({
  label,
  points,
  note,
  context,
  direction = "neutral",
}: SeasonChartProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const width = 900;
  const height = 340;
  const left = 52;
  const right = 20;
  const top = 58;
  const bottom = 48;
  const values = points.map((point) => point.value);
  const maximum = Math.max(...values, 1);
  const minimum = Math.min(...values, 0);
  const range = Math.max(maximum - minimum, 1);
  const x = (index: number) =>
    left +
    (index * (width - left - right)) / Math.max(points.length - 1, 1);
  const y = (value: number) =>
    top + ((maximum - value) * (height - top - bottom)) / range;
  const plotted = points.map((point, index) => ({
    ...point,
    x: x(index),
    y: y(point.value),
  }));
  const path = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const ticks = [maximum, maximum - range / 2, minimum];
  const active = plotted.find((point) => point.season === activeSeason) ?? null;
  const directionLabel =
    direction === "higher"
      ? "Higher is better"
      : direction === "lower"
        ? "Lower is better"
        : null;

  if (points.length === 0) {
    return (
      <div className="portal-chart empty">
        <p>No season-level data is available for {label.toLowerCase()}.</p>
        {note && <small>{note}</small>}
      </div>
    );
  }

  return (
    <div className="portal-chart">
      <div className="chart-toolbar">
        <div>{directionLabel && <span>{directionLabel}</span>}</div>
        <div aria-label={`${label} display`}>
          <button
            type="button"
            className={view === "chart" ? "active" : undefined}
            onClick={() => setView("chart")}
          >
            Chart
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : undefined}
            onClick={() => setView("table")}
          >
            Table
          </button>
        </div>
      </div>

      {view === "chart" ? (
        <div className="portal-chart-scroll">
          <div className="portal-chart-canvas">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${label} by season`}
              onMouseLeave={() => setActiveSeason(null)}
            >
              {[...new Set(ticks)].map((tick) => (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(tick)}
                    y2={y(tick)}
                  />
                  <text x="4" y={y(tick) + 4}>
                    {Number.isInteger(tick)
                      ? integer.format(tick)
                      : tick.toFixed(1)}
                  </text>
                </g>
              ))}
              <polyline
                className="portal-chart-area"
                points={`${left},${height - bottom} ${path} ${width - right},${height - bottom}`}
              />
              <polyline className="portal-chart-line" points={path} />
              {plotted.map((point, index) => {
                const pointLabel =
                  point.valueLabel ??
                  (Number.isInteger(point.value)
                    ? integer.format(point.value)
                    : point.value.toFixed(1));
                return (
                  <g
                    className="portal-chart-point"
                    key={point.season}
                    onMouseEnter={() => setActiveSeason(point.season)}
                    onFocus={() => setActiveSeason(point.season)}
                    onBlur={() => setActiveSeason(null)}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="6"
                      tabIndex={0}
                      aria-label={`${point.season}: ${point.display}`}
                    />
                    <text
                      className="portal-point-value"
                      x={point.x}
                      y={point.y - 11}
                      transform={`rotate(-90 ${point.x} ${point.y - 11})`}
                    >
                      {pointLabel}
                    </text>
                    {(plotted.length <= 12 ||
                      index === 0 ||
                      index === plotted.length - 1 ||
                      index % 3 === 0) && (
                      <text
                        className="portal-season-label"
                        x={point.x}
                        y={height - 16}
                      >
                        {point.season}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {active && (
              <div
                className={`chart-tooltip${active.x > width * 0.72 ? " align-left" : ""}${active.y < 105 ? " below" : ""}`}
                style={{
                  left: `${(active.x / width) * 100}%`,
                  top: `${(active.y / height) * 100}%`,
                }}
                role="status"
              >
                <strong>{active.season}</strong>
                <span>
                  {label}: {active.display}
                </span>
                {active.details?.map((detail) => (
                  <small key={detail}>{detail}</small>
                ))}
                {context && <small>{context}</small>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="season-data-table" role="region" aria-label={`${label} data`}>
          <table>
            <thead>
              <tr>
                <th>Season</th>
                <th>{label}</th>
                <th>Supporting data</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.season}>
                  <th scope="row">{point.season}</th>
                  <td>{point.display}</td>
                  <td>{point.details?.join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {note && <p className="chart-note">{note}</p>}
    </div>
  );
}
