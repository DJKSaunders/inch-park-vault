"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type BattingRow = [
  string,
  number,
  string,
  string,
  string,
  string,
  number | null,
  boolean,
  boolean,
  number,
  number,
  number,
];

type BowlingRow = [
  string,
  number,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  number,
];

type RecordsData = {
  meta: {
    seasonStart: number;
    seasonEnd: number;
    recordCount: number;
    playerCount: number;
    seasonCount: number;
    teams: string[];
    matchTypes: string[];
    oppositions: string[];
    playerNames: string[];
  };
  batting: BattingRow[];
  bowling: BowlingRow[];
};

type PlayerStats = {
  name: string;
  battingRuns: number;
  innings: number;
  outs: number;
  highScore: number;
  hundreds: number;
  fifties: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  balls: number;
  maidens: number;
  bowlingRuns: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
  matches: Set<string>;
};

type MetricKey =
  | "runs"
  | "battingAverage"
  | "highScore"
  | "hundreds"
  | "fifties"
  | "wickets"
  | "bowlingAverage"
  | "economy"
  | "bestBowling"
  | "catches";

type MetricDefinition = {
  label: string;
  shortLabel: string;
  category: "batting" | "bowling" | "fielding";
  ascending?: boolean;
  value: (stats: PlayerStats) => number | null;
  display: (stats: PlayerStats) => string;
};

const integer = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const metrics: Record<MetricKey, MetricDefinition> = {
  runs: {
    label: "Batting runs",
    shortLabel: "Runs",
    category: "batting",
    value: (stats) => stats.battingRuns,
    display: (stats) => integer.format(stats.battingRuns),
  },
  battingAverage: {
    label: "Batting average",
    shortLabel: "Bat avg",
    category: "batting",
    value: (stats) => (stats.outs > 0 ? stats.battingRuns / stats.outs : null),
    display: (stats) =>
      stats.outs > 0 ? decimal.format(stats.battingRuns / stats.outs) : "—",
  },
  highScore: {
    label: "Highest score",
    shortLabel: "HS",
    category: "batting",
    value: (stats) => stats.highScore,
    display: (stats) => integer.format(stats.highScore),
  },
  hundreds: {
    label: "Hundreds",
    shortLabel: "100s",
    category: "batting",
    value: (stats) => stats.hundreds,
    display: (stats) => integer.format(stats.hundreds),
  },
  fifties: {
    label: "Fifties",
    shortLabel: "50s",
    category: "batting",
    value: (stats) => stats.fifties,
    display: (stats) => integer.format(stats.fifties),
  },
  wickets: {
    label: "Bowling wickets",
    shortLabel: "Wkts",
    category: "bowling",
    value: (stats) => stats.wickets,
    display: (stats) => integer.format(stats.wickets),
  },
  bowlingAverage: {
    label: "Bowling average",
    shortLabel: "Bowl avg",
    category: "bowling",
    ascending: true,
    value: (stats) =>
      stats.wickets > 0 ? stats.bowlingRuns / stats.wickets : null,
    display: (stats) =>
      stats.wickets > 0
        ? decimal.format(stats.bowlingRuns / stats.wickets)
        : "—",
  },
  economy: {
    label: "Economy rate",
    shortLabel: "Econ",
    category: "bowling",
    ascending: true,
    value: (stats) =>
      stats.balls > 0 ? stats.bowlingRuns / (stats.balls / 6) : null,
    display: (stats) =>
      stats.balls > 0
        ? decimal.format(stats.bowlingRuns / (stats.balls / 6))
        : "—",
  },
  bestBowling: {
    label: "Best bowling",
    shortLabel: "BB",
    category: "bowling",
    value: (stats) =>
      stats.bestWickets > 0 ? stats.bestWickets * 1000 - stats.bestRuns : null,
    display: (stats) =>
      stats.bestWickets > 0 ? `${stats.bestWickets}/${stats.bestRuns}` : "—",
  },
  catches: {
    label: "Catches",
    shortLabel: "Ct",
    category: "fielding",
    value: (stats) => stats.catches,
    display: (stats) => integer.format(stats.catches),
  },
};

const metricColumn: Record<MetricKey, string> = {
  runs: "runs",
  battingAverage: "battingAverage",
  highScore: "highScore",
  hundreds: "hundreds",
  fifties: "fifties",
  wickets: "wickets",
  bowlingAverage: "bowlingAverage",
  economy: "economy",
  bestBowling: "bestBowling",
  catches: "catches",
};

function newStats(name: string): PlayerStats {
  return {
    name,
    battingRuns: 0,
    innings: 0,
    outs: 0,
    highScore: 0,
    hundreds: 0,
    fifties: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    balls: 0,
    maidens: 0,
    bowlingRuns: 0,
    wickets: 0,
    bestWickets: 0,
    bestRuns: Number.POSITIVE_INFINITY,
    matches: new Set<string>(),
  };
}

function addBatting(stats: PlayerStats, row: BattingRow) {
  const runs = typeof row[6] === "number" ? row[6] : 0;
  if (!row[8]) {
    stats.innings += 1;
    stats.battingRuns += runs;
    stats.highScore = Math.max(stats.highScore, runs);
    if (!row[7]) stats.outs += 1;
    if (runs >= 100) stats.hundreds += 1;
    else if (runs >= 50) stats.fifties += 1;
  }
  stats.catches += row[9];
  stats.stumpings += row[10];
  stats.runOuts += row[11];
  stats.matches.add(`${row[5]}|${row[2]}|${row[4]}`);
}

function addBowling(stats: PlayerStats, row: BowlingRow) {
  stats.balls += row[6];
  stats.maidens += row[7];
  stats.bowlingRuns += row[8];
  stats.wickets += row[9];
  if (
    row[9] > stats.bestWickets ||
    (row[9] === stats.bestWickets && row[8] < stats.bestRuns)
  ) {
    stats.bestWickets = row[9];
    stats.bestRuns = row[8];
  }
  stats.matches.add(`${row[5]}|${row[2]}|${row[4]}`);
}

function passesQualification(
  stats: PlayerStats,
  qualification: string,
  category: MetricDefinition["category"],
) {
  if (qualification === "any") return true;
  const regular = qualification === "regular";
  if (category === "batting") return stats.innings >= (regular ? 10 : 5);
  if (category === "bowling") return stats.balls >= (regular ? 150 : 60);
  return stats.matches.size >= (regular ? 10 : 5);
}

function yearLabel(startYear: number, endYear: number) {
  return startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
}

function initials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function overs(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function battingAverage(stats: PlayerStats) {
  return stats.outs > 0 ? decimal.format(stats.battingRuns / stats.outs) : "—";
}

function bowlingAverage(stats: PlayerStats) {
  return stats.wickets > 0
    ? decimal.format(stats.bowlingRuns / stats.wickets)
    : "—";
}

function economy(stats: PlayerStats) {
  return stats.balls > 0
    ? decimal.format(stats.bowlingRuns / (stats.balls / 6))
    : "—";
}

function bestBowling(stats: PlayerStats) {
  return stats.bestWickets > 0
    ? `${stats.bestWickets}/${stats.bestRuns}`
    : "—";
}

export function RecordsExplorer() {
  const [data, setData] = useState<RecordsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [startYear, setStartYear] = useState(2004);
  const [endYear, setEndYear] = useState(2025);
  const [team, setTeam] = useState("All teams");
  const [matchType, setMatchType] = useState("All match types");
  const [opposition, setOpposition] = useState("");
  const [metric, setMetric] = useState<MetricKey>("runs");
  const [qualification, setQualification] = useState("established");
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/data/records.json")
      .then((response) => {
        if (!response.ok) throw new Error("Records could not be loaded");
        return response.json();
      })
      .then((records: RecordsData) => {
        if (!active) return;
        setData(records);
        setStartYear(records.meta.seasonStart);
        setEndYear(records.meta.seasonEnd);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!openPlayer) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPlayer(null);
    };
    document.body.classList.add("dialog-open");
    window.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("dialog-open");
      window.removeEventListener("keydown", close);
    };
  }, [openPlayer]);

  const filtered = useMemo(() => {
    if (!data) return { batting: [], bowling: [] };
    const passes = (row: BattingRow | BowlingRow) =>
      row[1] >= startYear &&
      row[1] <= endYear &&
      (team === "All teams" || row[2] === team) &&
      (matchType === "All match types" || row[3] === matchType) &&
      (!opposition.trim() ||
        row[4].toLowerCase().includes(opposition.trim().toLowerCase()));
    return {
      batting: data.batting.filter(passes),
      bowling: data.bowling.filter(passes),
    };
  }, [data, endYear, matchType, opposition, startYear, team]);

  const statsByPlayer = useMemo(() => {
    const stats = new Map<string, PlayerStats>();
    const get = (name: string) => {
      let current = stats.get(name);
      if (!current) {
        current = newStats(name);
        stats.set(name, current);
      }
      return current;
    };
    for (const row of filtered.batting) addBatting(get(row[0]), row);
    for (const row of filtered.bowling) addBowling(get(row[0]), row);
    return stats;
  }, [filtered]);

  const leaderboard = useMemo(() => {
    const definition = metrics[metric];
    return [...statsByPlayer.values()]
      .filter((stats) =>
        passesQualification(stats, qualification, definition.category),
      )
      .map((stats) => ({ stats, value: definition.value(stats) }))
      .filter(
        (
          entry,
        ): entry is {
          stats: PlayerStats;
          value: number;
        } => entry.value !== null && Number.isFinite(entry.value),
      )
      .sort((a, b) =>
        definition.ascending ? a.value - b.value : b.value - a.value,
      )
      .slice(0, 100);
  }, [metric, qualification, statsByPlayer]);

  const selectedStats = openPlayer
    ? statsByPlayer.get(openPlayer) ?? newStats(openPlayer)
    : null;

  const seasonTrend = useMemo(() => {
    if (!openPlayer) return [];
    const points: { season: number; value: number; display: string }[] = [];
    for (let season = startYear; season <= endYear; season += 1) {
      const seasonStats = newStats(openPlayer);
      for (const row of filtered.batting) {
        if (row[0] === openPlayer && row[1] === season) addBatting(seasonStats, row);
      }
      for (const row of filtered.bowling) {
        if (row[0] === openPlayer && row[1] === season) addBowling(seasonStats, row);
      }
      const value = metrics[metric].value(seasonStats);
      if (value !== null && Number.isFinite(value)) {
        points.push({
          season,
          value,
          display: metrics[metric].display(seasonStats),
        });
      }
    }
    return points;
  }, [endYear, filtered, metric, openPlayer, startYear]);

  const chart = useMemo(() => {
    const width = 860;
    const height = 300;
    const padX = 42;
    const padTop = 22;
    const padBottom = 42;
    const values = seasonTrend.map((point) => point.value);
    const maximum = Math.max(...values, 1);
    const minimum = metrics[metric].ascending
      ? Math.min(...values, 0)
      : 0;
    const range = Math.max(maximum - minimum, 1);
    const x = (index: number) =>
      padX +
      (index * (width - padX * 2)) / Math.max(seasonTrend.length - 1, 1);
    const y = (value: number) =>
      padTop +
      ((maximum - value) * (height - padTop - padBottom)) / range;
    const points = seasonTrend.map((point, index) => ({
      ...point,
      x: x(index),
      y: y(point.value),
    }));
    return {
      width,
      height,
      points,
      path: points.map((point) => `${point.x},${point.y}`).join(" "),
      maximum,
      minimum,
    };
  }, [metric, seasonTrend]);

  function openSearchedPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const query = playerQuery.trim().toLowerCase();
    const match =
      data.meta.playerNames.find((name) => name.toLowerCase() === query) ??
      data.meta.playerNames.find((name) =>
        name.toLowerCase().includes(query),
      );
    if (match) {
      setOpenPlayer(match);
      setPlayerQuery("");
    }
  }

  function resetFilters() {
    if (!data) return;
    setStartYear(data.meta.seasonStart);
    setEndYear(data.meta.seasonEnd);
    setTeam("All teams");
    setMatchType("All match types");
    setOpposition("");
    setQualification("established");
  }

  const activeColumn = metricColumn[metric];

  if (loadError) {
    return (
      <main className="status-screen">
        <img src="/escc-logo.png" alt="Edinburgh South CC" />
        <h1>Club records are temporarily unavailable.</h1>
        <p>Please refresh the page to try loading the archive again.</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="status-screen" aria-live="polite">
        <img src="/escc-logo.png" alt="Edinburgh South CC" />
        <div className="loading-line" />
        <p>Preparing the club archive…</p>
      </main>
    );
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Edinburgh South CC records">
          <img src="/escc-logo.png" alt="" />
          <span>
            <strong>Edinburgh South CC</strong>
            <small>Club records</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#rankings">Rankings</a>
          <a href="https://www.edinburghsouthcc.org" target="_blank" rel="noreferrer">
            Club website <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className="ranking-hero" id="top">
        <div className="ranking-intro">
          <p className="eyebrow">The South archive · 2004–2025</p>
          <h1>
            Rank the <em>South.</em>
          </h1>
          <p>
            Choose the measure that matters, shape the timeframe and compare
            every player across the complete club archive.
          </p>
        </div>
        <label className="metric-selector">
          <span>Rank players by</span>
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as MetricKey)}
          >
            <optgroup label="Batting">
              <option value="runs">Batting runs</option>
              <option value="battingAverage">Batting average</option>
              <option value="highScore">Highest score</option>
              <option value="hundreds">Hundreds</option>
              <option value="fifties">Fifties</option>
            </optgroup>
            <optgroup label="Bowling">
              <option value="wickets">Bowling wickets</option>
              <option value="bowlingAverage">Bowling average</option>
              <option value="economy">Economy rate</option>
              <option value="bestBowling">Best bowling</option>
            </optgroup>
            <optgroup label="Fielding">
              <option value="catches">Catches</option>
            </optgroup>
          </select>
          <small>Top 100 · highlighted in the table below</small>
        </label>
      </section>

      <section className="archive-stats" aria-label="Archive summary">
        <div>
          <strong>{integer.format(data.meta.recordCount)}</strong>
          <span>Performances</span>
        </div>
        <div>
          <strong>{integer.format(data.meta.playerCount)}</strong>
          <span>Players</span>
        </div>
        <div>
          <strong>{integer.format(data.meta.seasonCount)}</strong>
          <span>Seasons</span>
        </div>
      </section>

      <section className="rankings-shell" id="rankings">
        <div className="rankings-toolbar">
          <div>
            <p className="eyebrow">Top 100 rankings</p>
            <h2>{metrics[metric].label}</h2>
          </div>
          <form className="compact-search" onSubmit={openSearchedPlayer}>
            <label htmlFor="player-search">Open player record</label>
            <div>
              <input
                id="player-search"
                list="player-names"
                value={playerQuery}
                onChange={(event) => setPlayerQuery(event.target.value)}
                placeholder="Search player"
              />
              <button type="submit">Open</button>
            </div>
            <datalist id="player-names">
              {data.meta.playerNames.map((name) => (
                <option value={name} key={name} />
              ))}
            </datalist>
          </form>
        </div>

        <div className="filters-heading">
          <span>Filter the ranking</span>
          <button type="button" onClick={resetFilters}>Reset</button>
        </div>
        <div className="filters" aria-label="Ranking filters">
          <label>
            <span>From season</span>
            <select
              value={startYear}
              onChange={(event) =>
                setStartYear(Math.min(Number(event.target.value), endYear))
              }
            >
              {Array.from(
                { length: data.meta.seasonEnd - data.meta.seasonStart + 1 },
                (_, index) => data.meta.seasonStart + index,
              ).map((season) => <option key={season}>{season}</option>)}
            </select>
          </label>
          <label>
            <span>To season</span>
            <select
              value={endYear}
              onChange={(event) =>
                setEndYear(Math.max(Number(event.target.value), startYear))
              }
            >
              {Array.from(
                { length: data.meta.seasonEnd - data.meta.seasonStart + 1 },
                (_, index) => data.meta.seasonStart + index,
              ).map((season) => <option key={season}>{season}</option>)}
            </select>
          </label>
          <label>
            <span>Team</span>
            <select value={team} onChange={(event) => setTeam(event.target.value)}>
              <option>All teams</option>
              {data.meta.teams.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Match type</span>
            <select value={matchType} onChange={(event) => setMatchType(event.target.value)}>
              <option>All match types</option>
              {data.meta.matchTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Opposition</span>
            <input
              list="oppositions"
              value={opposition}
              onChange={(event) => setOpposition(event.target.value)}
              placeholder="All opponents"
            />
            <datalist id="oppositions">
              {data.meta.oppositions.map((item) => (
                <option value={item} key={item} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Qualification</span>
            <select value={qualification} onChange={(event) => setQualification(event.target.value)}>
              <option value="any">Any sample</option>
              <option value="established">Established</option>
              <option value="regular">Regular</option>
            </select>
          </label>
        </div>

        <div className="results-context" aria-live="polite">
          <span>{yearLabel(startYear, endYear)}</span>
          <span>{team}</span>
          <span>{matchType}</span>
          {opposition && <span>vs {opposition}</span>}
          <strong>{leaderboard.length} ranked players</strong>
        </div>

        <div className="stats-table-wrap">
          <table className="stats-table">
            <caption>
              Top {leaderboard.length} players ranked by {metrics[metric].label.toLowerCase()}.
              Select a player name to open their record.
            </caption>
            <thead>
              <tr>
                <th className="rank-col">Rank</th>
                <th className="player-col">Player</th>
                <th>Mat</th>
                <th>Inn</th>
                <th className={activeColumn === "runs" ? "active-sort" : ""}>Runs</th>
                <th className={activeColumn === "battingAverage" ? "active-sort" : ""}>Bat avg</th>
                <th className={activeColumn === "highScore" ? "active-sort" : ""}>HS</th>
                <th className={activeColumn === "fifties" ? "active-sort" : ""}>50s</th>
                <th className={activeColumn === "hundreds" ? "active-sort" : ""}>100s</th>
                <th>Overs</th>
                <th className={activeColumn === "wickets" ? "active-sort" : ""}>Wkts</th>
                <th className={activeColumn === "bowlingAverage" ? "active-sort" : ""}>Bowl avg</th>
                <th className={activeColumn === "economy" ? "active-sort" : ""}>Econ</th>
                <th className={activeColumn === "bestBowling" ? "active-sort" : ""}>BB</th>
                <th className={activeColumn === "catches" ? "active-sort" : ""}>Ct</th>
                <th>St</th>
                <th>RO</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(({ stats }, index) => (
                <tr key={stats.name}>
                  <td className="rank-col">{String(index + 1).padStart(2, "0")}</td>
                  <th scope="row" className="player-col">
                    <button type="button" onClick={() => setOpenPlayer(stats.name)}>
                      <span>{stats.name}</span>
                      <small>View player record ↗</small>
                    </button>
                  </th>
                  <td>{integer.format(stats.matches.size)}</td>
                  <td>{integer.format(stats.innings)}</td>
                  <td className={activeColumn === "runs" ? "active-sort" : ""}>{integer.format(stats.battingRuns)}</td>
                  <td className={activeColumn === "battingAverage" ? "active-sort" : ""}>{battingAverage(stats)}</td>
                  <td className={activeColumn === "highScore" ? "active-sort" : ""}>{integer.format(stats.highScore)}</td>
                  <td className={activeColumn === "fifties" ? "active-sort" : ""}>{integer.format(stats.fifties)}</td>
                  <td className={activeColumn === "hundreds" ? "active-sort" : ""}>{integer.format(stats.hundreds)}</td>
                  <td>{overs(stats.balls)}</td>
                  <td className={activeColumn === "wickets" ? "active-sort" : ""}>{integer.format(stats.wickets)}</td>
                  <td className={activeColumn === "bowlingAverage" ? "active-sort" : ""}>{bowlingAverage(stats)}</td>
                  <td className={activeColumn === "economy" ? "active-sort" : ""}>{economy(stats)}</td>
                  <td className={activeColumn === "bestBowling" ? "active-sort" : ""}>{bestBowling(stats)}</td>
                  <td className={activeColumn === "catches" ? "active-sort" : ""}>{integer.format(stats.catches)}</td>
                  <td>{integer.format(stats.stumpings)}</td>
                  <td>{integer.format(stats.runOuts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leaderboard.length === 0 && (
            <p className="empty-state">No qualifying performances match these filters.</p>
          )}
        </div>
        <p className="table-note">
          The highlighted column controls the ranking. Lower values rank first
          for bowling average and economy. “Established” requires 5 innings,
          10 overs or 5 matches depending on the measure.
        </p>
      </section>

      <footer>
        <div>
          <img src="/escc-logo.png" alt="" />
          <p>
            Edinburgh South Cricket Club
            <br />
            <span>Come on the South.</span>
          </p>
        </div>
        <p>
          Archive covers recorded performances from 2004–2025.
          <br />
          Statistics update with each annual data release.
        </p>
      </footer>

      {openPlayer && selectedStats && (
        <div className="player-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpenPlayer(null);
        }}>
          <section
            className="player-record"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-record-title"
          >
            <header>
              <div className="player-identity">
                <span>{initials(openPlayer)}</span>
                <div>
                  <p className="eyebrow">Player record · {yearLabel(startYear, endYear)}</p>
                  <h2 id="player-record-title">{openPlayer}</h2>
                </div>
              </div>
              <button
                className="close-player"
                type="button"
                onClick={() => setOpenPlayer(null)}
                aria-label="Close player record"
              >
                ×
              </button>
            </header>

            <div className="record-filter-context">
              <span>{team}</span>
              <span>{matchType}</span>
              {opposition && <span>vs {opposition}</span>}
            </div>

            <div className="player-stat-grid">
              <div><span>Matches</span><strong>{integer.format(selectedStats.matches.size)}</strong></div>
              <div><span>Runs</span><strong>{integer.format(selectedStats.battingRuns)}</strong></div>
              <div><span>Batting average</span><strong>{battingAverage(selectedStats)}</strong></div>
              <div><span>High score</span><strong>{integer.format(selectedStats.highScore)}</strong></div>
              <div><span>Wickets</span><strong>{integer.format(selectedStats.wickets)}</strong></div>
              <div><span>Bowling average</span><strong>{bowlingAverage(selectedStats)}</strong></div>
              <div><span>Best bowling</span><strong>{bestBowling(selectedStats)}</strong></div>
              <div><span>Catches</span><strong>{integer.format(selectedStats.catches)}</strong></div>
            </div>

            <div className="chart-card">
              <div className="chart-title">
                <div>
                  <span>{metrics[metric].label} by season</span>
                  <strong>{metrics[metric].display(selectedStats)}</strong>
                </div>
                <p>Current ranking measure</p>
              </div>
              {chart.points.length > 0 ? (
                <svg
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  role="img"
                  aria-label={`${metrics[metric].label} by season for ${openPlayer}`}
                >
                  {[0, 0.5, 1].map((position) => {
                    const y = 22 + position * 236;
                    const value =
                      chart.maximum - position * (chart.maximum - chart.minimum);
                    return (
                      <g key={position}>
                        <line x1="42" x2="818" y1={y} y2={y} />
                        <text x="4" y={y + 4}>
                          {Number.isInteger(value) ? integer.format(value) : value.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
                  <polyline className="chart-area" points={`42,258 ${chart.path} 818,258`} />
                  <polyline className="chart-line" points={chart.path} />
                  {chart.points.map((point, index) => (
                    <g key={point.season}>
                      <circle cx={point.x} cy={point.y} r="5">
                        <title>{`${point.season}: ${point.display}`}</title>
                      </circle>
                      {(chart.points.length <= 12 ||
                        index === 0 ||
                        index === chart.points.length - 1 ||
                        index % 3 === 0) && (
                        <text className="season-label" x={point.x} y="284" textAnchor="middle">
                          {point.season}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              ) : (
                <p className="empty-state">No season-by-season values are available for this ranking.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
