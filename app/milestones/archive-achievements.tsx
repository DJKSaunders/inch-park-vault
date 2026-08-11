"use client";

import archive from "../../public/data/archive-developments.json";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${monthNames[month - 1]} ${String(year).slice(-2)}`;
}
function dateRange(from: string, to: string) { return `${shortIsoDate(from)} – ${shortIsoDate(to)}`; }

export function LongestStreaks() {
  return <div className="streak-groups">
    <section><header><p className="eyebrow">Batting</p><h3>Consecutive qualifying innings</h3></header><div className="streak-card-grid">{Object.entries(archive.streaks.batting).map(([threshold, rows]) => <article key={`bat-${threshold}`}><h4>{threshold}+ runs</h4><ol>{rows.slice(0, 5).map((row) => <li key={row.player}><strong>{row.length}</strong><div><span>{row.player}</span><small>{dateRange(row.from, row.to)}</small></div></li>)}</ol></article>)}</div></section>
    <section><header><p className="eyebrow">Bowling</p><h3>Consecutive wicket-taking spells</h3></header><div className="streak-card-grid bowling">{Object.entries(archive.streaks.bowling).map(([threshold, rows]) => <article key={`bowl-${threshold}`}><h4>{threshold}+ {threshold === "1" ? "wicket" : "wickets"}</h4><ol>{rows.slice(0, 5).map((row) => <li key={row.player}><strong>{row.length}</strong><div><span>{row.player}</span><small>{dateRange(row.from, row.to)}</small></div></li>)}</ol></article>)}</div></section>
  </div>;
}
