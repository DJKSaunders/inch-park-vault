"use client";

import { useEffect, useMemo, useState } from "react";
import { canonicalOpponent } from "../opponents";
import { SiteHeader } from "../site-header";
import {
  addBatting,
  addBowling,
  battingAverage,
  bowlingAverage,
  bowlingStrikeRate,
  economy,
  emptyPlayerStats,
  oversFromBalls,
  type BattingRow,
  type BowlingRow,
  type PlayerStats,
  type RecordsData,
} from "../statistics";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Discipline = "batting" | "bowling" | "fielding" | "allround";
type GroupBy = "player" | "season" | "team" | "opposition" | "matchType";
type Metric =
  | "runs"
  | "average"
  | "innings"
  | "highScore"
  | "wickets"
  | "bowlingAverage"
  | "economy"
  | "bowlingStrikeRate"
  | "catches"
  | "stumpings"
  | "appearances"
  | "runsAndWickets";

type Filters = {
  startYear: number;
  endYear: number;
  teams: string[];
  matchTypes: string[];
  opposition: string;
};

type ReportRow = { label: string; stats: PlayerStats; playerId?: string };

const disciplineMetrics: Record<Discipline, Metric[]> = {
  batting: ["runs", "average", "innings", "highScore", "appearances"],
  bowling: [
    "wickets",
    "bowlingAverage",
    "economy",
    "bowlingStrikeRate",
    "appearances",
  ],
  fielding: ["catches", "stumpings", "appearances"],
  allround: ["runsAndWickets", "runs", "wickets", "appearances"],
};

const metricLabels: Record<Metric, string> = {
  runs: "Runs",
  average: "Batting average",
  innings: "Innings",
  highScore: "Highest score",
  wickets: "Wickets",
  bowlingAverage: "Bowling average",
  economy: "Economy",
  bowlingStrikeRate: "Bowling strike rate",
  catches: "Catches",
  stumpings: "Stumpings",
  appearances: "Appearances",
  runsAndWickets: "Runs + wickets",
};

function groupLabel(row: BattingRow | BowlingRow, groupBy: GroupBy) {
  if (groupBy === "player") return row[0];
  if (groupBy === "season") return String(row[1]);
  if (groupBy === "team") return row[2] || "Unknown team";
  if (groupBy === "opposition") return canonicalOpponent(row[4]);
  return row[3] || "Unknown match type";
}

function metricValue(metric: Metric, stats: PlayerStats) {
  if (metric === "runs") return stats.runs;
  if (metric === "average") return battingAverage(stats);
  if (metric === "innings") return stats.innings;
  if (metric === "highScore") return stats.highScore;
  if (metric === "wickets") return stats.wickets;
  if (metric === "bowlingAverage") return bowlingAverage(stats);
  if (metric === "economy") return economy(stats);
  if (metric === "bowlingStrikeRate") return bowlingStrikeRate(stats);
  if (metric === "catches") return stats.catches;
  if (metric === "stumpings") return stats.stumpings;
  if (metric === "appearances") return stats.matches.size;
  return stats.runs + stats.wickets;
}

function rowPasses(row: BattingRow | BowlingRow, filters: Filters) {
  return (
    row[1] >= filters.startYear &&
    row[1] <= filters.endYear &&
    (filters.teams.length === 0 || filters.teams.includes(row[2])) &&
    (filters.matchTypes.length === 0 || filters.matchTypes.includes(row[3])) &&
    (!filters.opposition ||
      canonicalOpponent(row[4])
        .toLowerCase()
        .includes(filters.opposition.toLowerCase()))
  );
}

function toggleItem(items: string[], item: string) {
  return items.includes(item)
    ? items.filter((current) => current !== item)
    : [...items, item];
}

export function VaultGuruExplorer() {
  const [data, setData] = useState<RecordsData | null>(null);
  const [playerIds, setPlayerIds] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [discipline, setDiscipline] = useState<Discipline>("batting");
  const [groupBy, setGroupBy] = useState<GroupBy>("player");
  const [metric, setMetric] = useState<Metric>("runs");
  const [minimum, setMinimum] = useState(0);
  const [sortAscending, setSortAscending] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    startYear: 2004,
    endYear: 2026,
    teams: [],
    matchTypes: [],
    opposition: "",
  });

  useEffect(() => {
    Promise.all([
      fetch(`${publicBasePath}/data/records.json`).then((response) => {
        if (!response.ok) throw new Error("Records unavailable");
        return response.json() as Promise<RecordsData>;
      }),
      fetch(`${publicBasePath}/data/scorecards/records-player-map.json`).then(
        async (response) => (response.ok ? response.json() : { players: {} }),
      ),
    ])
      .then(([records, identityMap]) => {
        setData(records);
        setFilters((current) => ({
          ...current,
          startYear: records.meta.seasonStart,
          endYear: records.meta.seasonEnd,
        }));
        const ids: Record<string, string> = {};
        for (const [name, identity] of Object.entries(
          identityMap.players as Record<string, { playerId: string } | null>,
        )) {
          if (identity) ids[name.toLowerCase()] = identity.playerId;
        }
        setPlayerIds(ids);
      })
      .catch(() => setFailed(true));
  }, []);

  const opponents = useMemo(() => {
    if (!data) return [];
    return [
      ...new Set(
        [...data.batting, ...data.bowling].map((row) =>
          canonicalOpponent(row[4]),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const report = useMemo(() => {
    if (!data) return [];
    const batting = data.batting.filter((row) => rowPasses(row, filters));
    const bowling = data.bowling.filter((row) => rowPasses(row, filters));
    const grouped = new Map<string, ReportRow>();
    const get = (label: string) => {
      const existing = grouped.get(label);
      if (existing) return existing;
      const created = {
        label,
        stats: emptyPlayerStats(label),
        playerId:
          groupBy === "player" ? playerIds[label.toLowerCase()] : undefined,
      };
      grouped.set(label, created);
      return created;
    };
    for (const row of batting) {
      const item = get(groupLabel(row, groupBy));
      addBatting(item.stats, row);
    }
    for (const row of bowling) {
      const item = get(groupLabel(row, groupBy));
      addBowling(item.stats, row);
    }
    return [...grouped.values()]
      .filter((item) => item.stats.matches.size >= minimum)
      .filter((item) => metricValue(metric, item.stats) !== null)
      .sort((left, right) => {
        const a = metricValue(metric, left.stats) ?? 0;
        const b = metricValue(metric, right.stats) ?? 0;
        return sortAscending ? a - b : b - a;
      });
  }, [data, filters, groupBy, metric, minimum, playerIds, sortAscending]);

  function chooseDiscipline(next: Discipline) {
    setDiscipline(next);
    setMetric(disciplineMetrics[next][0]);
    setSortAscending(false);
  }

  function reset() {
    if (!data) return;
    setFilters({
      startYear: data.meta.seasonStart,
      endYear: data.meta.seasonEnd,
      teams: [],
      matchTypes: [],
      opposition: "",
    });
    setGroupBy("player");
    setMinimum(0);
  }

  function exportCsv() {
    const headings = [
      groupBy === "player" ? "Player" : "Group",
      "Appearances",
      "Innings",
      "Runs",
      "Batting average",
      "Wickets",
      "Bowling average",
      "Economy",
      "Catches",
      "Stumpings",
    ];
    const lines = report.map(({ label, stats }) => [
      label,
      stats.matches.size,
      stats.innings,
      stats.runs,
      battingAverage(stats) ?? "",
      stats.wickets,
      bowlingAverage(stats) ?? "",
      economy(stats) ?? "",
      stats.catches,
      stats.stumpings,
    ]);
    const csv = [headings, ...lines]
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `vaultguru-${discipline}-${groupBy}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (failed) {
    return <main className="status-screen"><h1>VaultGuru is temporarily unavailable.</h1></main>;
  }
  if (!data) {
    return <main className="status-screen"><p>Opening VaultGuru…</p></main>;
  }

  const years = Array.from(
    { length: data.meta.seasonEnd - data.meta.seasonStart + 1 },
    (_, index) => data.meta.seasonStart + index,
  );
  const activeFilters =
    filters.teams.length +
    filters.matchTypes.length +
    Number(Boolean(filters.opposition)) +
    Number(filters.startYear !== data.meta.seasonStart || filters.endYear !== data.meta.seasonEnd);

  return (
    <main className="vault-app vaultguru-app">
      <SiteHeader active="vaultguru" />
      <section className="vaultguru-hero">
        <p className="eyebrow">Build your own view of the archive</p>
        <h1>Vault<em>Guru.</em></h1>
        <p>Advanced search and report building across every available Edinburgh South performance.</p>
      </section>

      <section className="vaultguru-builder">
        <header>
          <div><span>Report builder</span><h2>Define your report</h2></div>
          <button type="button" onClick={reset}>Reset report</button>
        </header>

        <div className="vaultguru-steps">
          <fieldset>
            <legend><b>01</b> Statistical area</legend>
            <div className="vaultguru-segmented">
              {(["batting", "bowling", "fielding", "allround"] as Discipline[]).map((item) => (
                <button type="button" className={discipline === item ? "active" : ""} onClick={() => chooseDiscipline(item)} key={item}>
                  {item === "allround" ? "All-round" : item}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend><b>02</b> Match filters <span>{activeFilters || "None"} active</span></legend>
            <div className="vaultguru-filter-grid">
              <label><span>From season</span><select value={filters.startYear} onChange={(event) => setFilters((current) => ({ ...current, startYear: Math.min(Number(event.target.value), current.endYear) }))}>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
              <label><span>To season</span><select value={filters.endYear} onChange={(event) => setFilters((current) => ({ ...current, endYear: Math.max(Number(event.target.value), current.startYear) }))}>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
              <details className="vaultguru-multi"><summary><span>Teams</span><strong>{filters.teams.length ? `${filters.teams.length} selected` : "All teams"}</strong></summary><div>{data.meta.teams.map((team) => <label key={team}><input type="checkbox" checked={filters.teams.includes(team)} onChange={() => setFilters((current) => ({ ...current, teams: toggleItem(current.teams, team) }))}/>{team}</label>)}</div></details>
              <details className="vaultguru-multi"><summary><span>Match types</span><strong>{filters.matchTypes.length ? `${filters.matchTypes.length} selected` : "All types"}</strong></summary><div>{data.meta.matchTypes.map((type) => <label key={type}><input type="checkbox" checked={filters.matchTypes.includes(type)} onChange={() => setFilters((current) => ({ ...current, matchTypes: toggleItem(current.matchTypes, type) }))}/>{type}</label>)}</div></details>
              <label><span>Opposition</span><input list="vaultguru-opponents" value={filters.opposition} onChange={(event) => setFilters((current) => ({ ...current, opposition: event.target.value }))} placeholder="All opponents"/><datalist id="vaultguru-opponents">{opponents.map((opponent) => <option value={opponent} key={opponent}/>)}</datalist></label>
            </div>
            <div className="vaultguru-chips">
              {filters.teams.map((team) => <button type="button" key={team} onClick={() => setFilters((current) => ({ ...current, teams: toggleItem(current.teams, team) }))}>{team} ×</button>)}
              {filters.matchTypes.map((type) => <button type="button" key={type} onClick={() => setFilters((current) => ({ ...current, matchTypes: toggleItem(current.matchTypes, type) }))}>{type} ×</button>)}
              {filters.opposition && <button type="button" onClick={() => setFilters((current) => ({ ...current, opposition: "" }))}>vs {filters.opposition} ×</button>}
            </div>
          </fieldset>

          <fieldset>
            <legend><b>03</b> Shape the results</legend>
            <div className="vaultguru-filter-grid vaultguru-shape-grid">
              <label><span>Group rows by</span><select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}><option value="player">Player</option><option value="season">Season</option><option value="team">Team</option><option value="opposition">Opposition</option><option value="matchType">Match type</option></select></label>
              <label><span>Rank by</span><select value={metric} onChange={(event) => { setMetric(event.target.value as Metric); setSortAscending(false); }}>{disciplineMetrics[discipline].map((item) => <option value={item} key={item}>{metricLabels[item]}</option>)}</select></label>
              <label><span>Minimum appearances</span><select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}><option value="0">Any</option><option value="5">5+</option><option value="10">10+</option><option value="25">25+</option><option value="50">50+</option></select></label>
              <button type="button" className="vaultguru-sort" onClick={() => setSortAscending((current) => !current)}>{sortAscending ? "Lowest first ↑" : "Highest first ↓"}</button>
            </div>
          </fieldset>
        </div>
      </section>

      <section className="vaultguru-results">
        <header>
          <div><span>Generated report</span><h2>{metricLabels[metric]} by {groupBy === "matchType" ? "match type" : groupBy}</h2><p>{integer.format(report.length)} rows · {filters.startYear}–{filters.endYear}</p></div>
          <button type="button" onClick={exportCsv} disabled={report.length === 0}>Export CSV</button>
        </header>
        <div className="stats-table-wrap">
          <table className="stats-table vaultguru-table">
            <thead><tr><th>Rank</th><th>{groupBy === "player" ? "Player" : "Group"}</th><th>Mat</th><th>Inn</th><th>Runs</th><th>Bat avg</th><th>HS</th><th>Overs</th><th>Wkts</th><th>Bowl avg</th><th>Econ</th><th>Bowl SR</th><th>Ct</th><th>St</th></tr></thead>
            <tbody>{report.slice(0, 200).map(({ label, stats, playerId }, index) => <tr key={label}><td>{String(index + 1).padStart(2, "0")}</td><th scope="row">{playerId ? <a href={`${publicBasePath}/players/${playerId}/`}>{label}</a> : label}</th><td>{integer.format(stats.matches.size)}</td><td>{integer.format(stats.innings)}</td><td className={metric === "runs" || metric === "runsAndWickets" ? "active-sort" : ""}>{integer.format(stats.runs)}</td><td className={metric === "average" ? "active-sort" : ""}>{battingAverage(stats) === null ? "—" : decimal.format(battingAverage(stats)!)}</td><td className={metric === "highScore" ? "active-sort" : ""}>{integer.format(stats.highScore)}</td><td>{oversFromBalls(stats.balls)}</td><td className={metric === "wickets" || metric === "runsAndWickets" ? "active-sort" : ""}>{integer.format(stats.wickets)}</td><td className={metric === "bowlingAverage" ? "active-sort" : ""}>{bowlingAverage(stats) === null ? "—" : decimal.format(bowlingAverage(stats)!)}</td><td className={metric === "economy" ? "active-sort" : ""}>{economy(stats) === null ? "—" : decimal.format(economy(stats)!)}</td><td className={metric === "bowlingStrikeRate" ? "active-sort" : ""}>{bowlingStrikeRate(stats) === null ? "—" : decimal.format(bowlingStrikeRate(stats)!)}</td><td className={metric === "catches" ? "active-sort" : ""}>{integer.format(stats.catches)}</td><td className={metric === "stumpings" ? "active-sort" : ""}>{integer.format(stats.stumpings)}</td></tr>)}</tbody>
          </table>
        </div>
        {report.length === 0 && <p className="empty-state">No results meet these report conditions.</p>}
      </section>
    </main>
  );
}
