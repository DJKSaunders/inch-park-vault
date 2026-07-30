"use client";

type ChartPoint = {
  season: number;
  value: number;
  display: string;
};

type SeasonChartProps = {
  label: string;
  points: ChartPoint[];
  note?: string;
};

const integer = new Intl.NumberFormat("en-GB");

export function SeasonChart({ label, points, note }: SeasonChartProps) {
  const width = 900;
  const height = 320;
  const left = 52;
  const right = 20;
  const top = 24;
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
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} by season`}>
        {[...new Set(ticks)].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
            <text x="4" y={y(tick) + 4}>
              {Number.isInteger(tick) ? integer.format(tick) : tick.toFixed(1)}
            </text>
          </g>
        ))}
        <polyline
          className="portal-chart-area"
          points={`${left},${height - bottom} ${path} ${width - right},${height - bottom}`}
        />
        <polyline className="portal-chart-line" points={path} />
        {plotted.map((point, index) => (
          <g key={point.season}>
            <circle cx={point.x} cy={point.y} r="5">
              <title>{`${point.season}: ${point.display}`}</title>
            </circle>
            {(plotted.length <= 12 ||
              index === 0 ||
              index === plotted.length - 1 ||
              index % 3 === 0) && (
              <text className="portal-season-label" x={point.x} y={height - 16}>
                {point.season}
              </text>
            )}
          </g>
        ))}
      </svg>
      {note && <p className="chart-note">{note}</p>}
    </div>
  );
}
