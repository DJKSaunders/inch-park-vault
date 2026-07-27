"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

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
    shortLabel: "Average",
    category: "batting",
    value: (stats) => (stats.outs > 0 ? stats.battingRuns / stats.outs : null),
    display: (stats) =>
      stats.outs > 0 ? decimal.format(stats.battingRuns / stats.outs) : "—",
  },
  highScore: {
    label: "Highest score",
    shortLabel: "High score",
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
    shortLabel: "Wickets",
    category: "bowling",
    value: (stats) => stats.wickets,
    display: (stats) => integer.format(stats.wickets),
  },
  bowlingAverage: {
    label: "Bowling average",
    shortLabel: "Average",
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
    shortLabel: "Economy",
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
    shortLabel: "Best",
    category: "bowling",
    value: (stats) =>
      stats.bestWickets > 0 ? stats.bestWickets * 1000 - stats.bestRuns : null,
    display: (stats) =>
      stats.bestWickets > 0 ? `${stats.bestWickets}/${stats.bestRuns}` : "—",
  },
  catches: {
    label: "Catches",
    shortLabel: "Catches",
    category: "fielding",
    value: (stats) => stats.catches,
    display: (stats) => integer.format(stats.catches),
  },
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

function passesQualification(
  stats: PlayerStats,
  qualification: string,
  category: MetricDefinition["category"],
) {
  if (qualification === "any") return true;
  const regular = qualification === "regular";

  if (category === "batting") {
    return stats.innings >= (regular ? 10 : 5);
  }

  if (category === "bowling") {
    return stats.balls >= (regular ? 150 : 60);
  }

  return stats.matches.size >= (regular ? 10 : 5);
}

function yearLabel(startYear: number, endYear: number) {
  return startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
}

function initials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
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
  const [selectedPlayer, setSelectedPlayer] = useState("Graeme Beghin");
  const [playerQuery, setPlayerQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

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
        if (!records.meta.playerNames.includes("Graeme Beghin")) {
          setSelectedPlayer(records.meta.playerNames[0] ?? "");
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return { batting: [], bowling: [] };
    const passes = (row: BattingRow | BowlingRow) =>
      row[1] >= startYear &&
      row[1] <= endYear &&
      (team === "All teams" || row[2] === team) &&
      (matchType === "All match types" || row[3] === matchType) &&
      (!opposition.trim() ||
        row[4].toLocaleLowerCase().includes(opposition.trim().toLocaleLowerCase()));

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

    for (const row of filtered.batting) {
      const current = get(row[0]);
      const runs = typeof row[6] === "number" ? row[6] : 0;
      if (!row[8]) {
        current.innings += 1;
        current.battingRuns += runs;
        current.highScore = Math.max(current.highScore, runs);
        if (!row[7]) current.outs += 1;
        if (runs >= 100) current.hundreds += 1;
        else if (runs >= 50) current.fifties += 1;
      }
      current.catches += row[9];
      current.stumpings += row[10];
      current.runOuts += row[11];
      current.matches.add(`${row[5]}|${row[2]}|${row[4]}`);
    }

    for (const row of filtered.bowling) {
      const current = get(row[0]);
      current.balls += row[6];
      current.maidens += row[7];
      current.bowlingRuns += row[8];
      current.wickets += row[9];
      if (
        row[9] > current.bestWickets ||
        (row[9] === current.bestWickets && row[8] < current.bestRuns)
      ) {
        current.bestWickets = row[9];
        current.bestRuns = row[8];
      }
      current.matches.add(`${row[5]}|${row[2]}|${row[4]}`);
    }

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

  const selectedStats =
    statsByPlayer.get(selectedPlayer) ?? newStats(selectedPlayer);

  const seasonTrend = useMemo(() => {
    if (!data || !selectedPlayer) return [];
    const points: { season: number; value: number; display: string }[] = [];
    for (let season = startYear; season <= endYear; season += 1) {
      const seasonStats = newStats(selectedPlayer);
      for (const row of filtered.batting) {
        if (row[0] !== selectedPlayer || row[1] !== season) continue;
        const runs = typeof row[6] === "number" ? row[6] : 0;
        if (!row[8]) {
          seasonStats.innings += 1;
          seasonStats.battingRuns += runs;
          seasonStats.highScore = Math.max(seasonStats.highScore, runs);
          if (!row[7]) seasonStats.outs += 1;
          if (runs >= 100) seasonStats.hundreds += 1;
          else if (runs >= 50) seasonStats.fifties += 1;
        }
        seasonStats.catches += row[9];
        seasonStats.stumpings += row[10];
        seasonStats.runOuts += row[11];
        seasonStats.matches.add(`${row[5]}|${row[2]}|${row[4]}`);
      }
      for (const row of filtered.bowling) {
        if (row[0] !== selectedPlayer || row[1] !== season) continue;
        seasonStats.balls += row[6];
        seasonStats.maidens += row[7];
        seasonStats.bowlingRuns += row[8];
        seasonStats.wickets += row[9];
        if (
          row[9] > seasonStats.bestWickets ||
          (row[9] === seasonStats.bestWickets && row[8] < seasonStats.bestRuns)
        ) {
          seasonStats.bestWickets = row[9];
          seasonStats.bestRuns = row[8];
        }
      }
      const trendValue = metrics[metric].value(seasonStats);
      if (trendValue !== null && Number.isFinite(trendValue)) {
        points.push({
          season,
          value: trendValue,
          display: metrics[metric].display(seasonStats),
        });
      }
    }
    return points;
  }, [data, endYear, filtered, metric, selectedPlayer, startYear]);

  const chart = useMemo(() => {
    const width = 760;
    const height = 270;
    const padX = 34;
    const padTop = 22;
    const padBottom = 36;
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

  const visibleLeaderboard = showAll
    ? leaderboard
    : leaderboard.slice(0, 12);

  function selectSearchedPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const query = playerQuery.trim().toLocaleLowerCase();
    const match =
      data.meta.playerNames.find(
        (name) => name.toLocaleLowerCase() === query,
      ) ??
      data.meta.playerNames.find((name) =>
        name.toLocaleLowerCase().includes(query),
      );
    if (match) {
      setSelectedPlayer(match);
      setPlayerQuery("");
      document
        .getElementById("career")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          <a href="#leaderboard">Rankings</a>
          <a href="#career">Player timeline</a>
          <a href="https://www.edinburghsouthcc.org" target="_blank" rel="noreferrer">
            Club website <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">The South archive · 2004–2025</p>
          <h1>
            Every innings.
            <br />
            Every spell.
            <br />
            <em>One club story.</em>
          </h1>
          <p className="hero-intro">
            Explore more than two decades of Edinburgh South performances,
            compare players and follow careers season by season.
          </p>
        </div>

        <form className="player-search" onSubmit={selectSearchedPlayer}>
          <label htmlFor="player-search">Find a player</label>
          <div className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              id="player-search"
              list="player-names"
              value={playerQuery}
              onChange={(event) => setPlayerQuery(event.target.value)}
              placeholder={`Search ${integer.format(data.meta.playerCount)} players`}
            />
            <button type="submit">Search records</button>
          </div>
          <datalist id="player-names">
            {data.meta.playerNames.map((name) => (
              <option value={name} key={name} />
            ))}
          </datalist>
          <p>
            Try a full or partial name. Select a leaderboard row to switch
            player instantly.
          </p>
        </form>
      </section>

      <section className="archive-stats" aria-label="Archive summary">
        <div>
          <strong>{integer.format(data.meta.recordCount)}</strong>
          <span>Recorded performances</span>
        </div>
        <div>
          <strong>{integer.format(data.meta.playerCount)}</strong>
          <span>Players in the archive</span>
        </div>
        <div>
          <strong>{integer.format(data.meta.seasonCount)}</strong>
          <span>Seasons of club cricket</span>
        </div>
      </section>

      <section className="explorer-shell">
        <div className="filter-heading">
          <div>
            <p className="eyebrow">Shape the archive</p>
            <h2>Choose the records you want to see</h2>
          </div>
          <button className="text-button" type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>

        <div className="filters" aria-label="Record filters">
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
              ).map((season) => (
                <option key={season}>{season}</option>
              ))}
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
              ).map((season) => (
                <option key={season}>{season}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Team</span>
            <select value={team} onChange={(event) => setTeam(event.target.value)}>
              <option>All teams</option>
              {data.meta.teams.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Match type</span>
            <select
              value={matchType}
              onChange={(event) => setMatchType(event.target.value)}
            >
              <option>All match types</option>
              {data.meta.matchTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
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
            <span>Ranking</span>
            <select
              value={metric}
              onChange={(event) => {
                setMetric(event.target.value as MetricKey);
                setShowAll(false);
              }}
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
          </label>
          <label>
            <span>Qualification</span>
            <select
              value={qualification}
              onChange={(event) => setQualification(event.target.value)}
            >
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
        </div>

        <div className="records-grid">
          <section className="leaderboard" id="leaderboard">
            <div className="section-heading">
              <div>
                <p className="eyebrow">All-time rankings</p>
                <h2>{metrics[metric].label}</h2>
              </div>
              <span className="top-hundred">Top 100</span>
            </div>
            <div className="table-head" aria-hidden="true">
              <span>Rank</span>
              <span>Player</span>
              <span>{metrics[metric].shortLabel}</span>
            </div>
            <ol className="ranking-list">
              {visibleLeaderboard.map(({ stats }, index) => (
                <li key={stats.name}>
                  <button
                    type="button"
                    className={selectedPlayer === stats.name ? "selected" : ""}
                    onClick={() => setSelectedPlayer(stats.name)}
                    aria-label={`View ${stats.name}'s player timeline`}
                  >
                    <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="rank-player">
                      <strong>{stats.name}</strong>
                      <small>
                        {stats.innings} innings · {stats.matches.size} matches
                      </small>
                    </span>
                    <strong className="rank-value">
                      {metrics[metric].display(stats)}
                    </strong>
                  </button>
                </li>
              ))}
            </ol>
            {leaderboard.length === 0 && (
              <p className="empty-state">
                No qualifying performances match these filters.
              </p>
            )}
            {leaderboard.length > 12 && (
              <button
                className="show-more"
                type="button"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll
                  ? "Show leading 12"
                  : `View full top ${leaderboard.length}`}
              </button>
            )}
          </section>

          <section className="career" id="career">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Season by season</p>
                <h2>Player over time</h2>
              </div>
              <div className="player-chip">
                <span>{initials(selectedPlayer)}</span>
                <strong>{selectedPlayer}</strong>
              </div>
            </div>

            <div className="player-summary">
              <div>
                <span>Career runs</span>
                <strong>{integer.format(selectedStats.battingRuns)}</strong>
              </div>
              <div>
                <span>Batting average</span>
                <strong>
                  {selectedStats.outs > 0
                    ? decimal.format(
                        selectedStats.battingRuns / selectedStats.outs,
                      )
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Wickets</span>
                <strong>{integer.format(selectedStats.wickets)}</strong>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-title">
                <div>
                  <span>{metrics[metric].label}</span>
                  <strong>
                    {metrics[metric].display(selectedStats)}
                  </strong>
                </div>
                <p>{yearLabel(startYear, endYear)} · per season</p>
              </div>
              {chart.points.length > 0 ? (
                <svg
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  role="img"
                  aria-label={`${metrics[metric].label} by season for ${selectedPlayer}`}
                >
                  {[0, 0.5, 1].map((position) => {
                    const y = 22 + position * 212;
                    const value =
                      chart.maximum -
                      position * (chart.maximum - chart.minimum);
                    return (
                      <g key={position}>
                        <line x1="34" x2="726" y1={y} y2={y} />
                        <text x="4" y={y + 4}>
                          {Number.isInteger(value)
                            ? integer.format(value)
                            : value.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
                  <polyline className="chart-area" points={`34,234 ${chart.path} 726,234`} />
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
                        <text
                          className="season-label"
                          x={point.x}
                          y="258"
                          textAnchor="middle"
                        >
                          {point.season}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              ) : (
                <p className="empty-state">
                  No season-by-season values are available for this player and
                  ranking.
                </p>
              )}
            </div>

            <div className="career-details">
              <div>
                <span>Innings</span>
                <strong>{integer.format(selectedStats.innings)}</strong>
              </div>
              <div>
                <span>High score</span>
                <strong>{integer.format(selectedStats.highScore)}</strong>
              </div>
              <div>
                <span>Best bowling</span>
                <strong>
                  {selectedStats.bestWickets > 0
                    ? `${selectedStats.bestWickets}/${selectedStats.bestRuns}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Catches</span>
                <strong>{integer.format(selectedStats.catches)}</strong>
              </div>
            </div>
          </section>
        </div>
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
    </main>
  );
}
