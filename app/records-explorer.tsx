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
  boundaries: [string, number, number][];
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
  | "matches"
  | "innings"
  | "runs"
  | "battingAverage"
  | "highScore"
  | "fifties"
  | "hundreds"
  | "overs"
  | "wickets"
  | "bowlingAverage"
  | "economy"
  | "bestBowling"
  | "catches"
  | "stumpings"
  | "runOuts";

type MetricDefinition = {
  label: string;
  shortLabel: string;
  category: "batting" | "bowling" | "fielding" | "general";
  ascending?: boolean;
  value: (stats: PlayerStats) => number | null;
  display: (stats: PlayerStats) => string;
};

type PerformanceFilters = {
  startYear: number;
  endYear: number;
  team: string;
  matchType: string;
  opposition: string;
};

const integer = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function battingAverageValue(stats: PlayerStats) {
  return stats.outs > 0 ? stats.battingRuns / stats.outs : null;
}

function bowlingAverageValue(stats: PlayerStats) {
  return stats.wickets > 0 ? stats.bowlingRuns / stats.wickets : null;
}

function economyValue(stats: PlayerStats) {
  return stats.balls > 0 ? stats.bowlingRuns / (stats.balls / 6) : null;
}

function overs(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

const metrics: Record<MetricKey, MetricDefinition> = {
  matches: {
    label: "Appearances",
    shortLabel: "Mat",
    category: "general",
    value: (stats) => stats.matches.size,
    display: (stats) => integer.format(stats.matches.size),
  },
  innings: {
    label: "Batting innings",
    shortLabel: "Inn",
    category: "batting",
    value: (stats) => stats.innings,
    display: (stats) => integer.format(stats.innings),
  },
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
    value: battingAverageValue,
    display: (stats) => {
      const value = battingAverageValue(stats);
      return value === null ? "—" : decimal.format(value);
    },
  },
  highScore: {
    label: "Highest score",
    shortLabel: "HS",
    category: "batting",
    value: (stats) => stats.highScore,
    display: (stats) => integer.format(stats.highScore),
  },
  fifties: {
    label: "Fifties",
    shortLabel: "50s",
    category: "batting",
    value: (stats) => stats.fifties,
    display: (stats) => integer.format(stats.fifties),
  },
  hundreds: {
    label: "Hundreds",
    shortLabel: "100s",
    category: "batting",
    value: (stats) => stats.hundreds,
    display: (stats) => integer.format(stats.hundreds),
  },
  overs: {
    label: "Overs bowled",
    shortLabel: "Overs",
    category: "bowling",
    value: (stats) => stats.balls,
    display: (stats) => overs(stats.balls),
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
    value: bowlingAverageValue,
    display: (stats) => {
      const value = bowlingAverageValue(stats);
      return value === null ? "—" : decimal.format(value);
    },
  },
  economy: {
    label: "Economy rate",
    shortLabel: "Econ",
    category: "bowling",
    ascending: true,
    value: economyValue,
    display: (stats) => {
      const value = economyValue(stats);
      return value === null ? "—" : decimal.format(value);
    },
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
  stumpings: {
    label: "Stumpings",
    shortLabel: "St",
    category: "fielding",
    value: (stats) => stats.stumpings,
    display: (stats) => integer.format(stats.stumpings),
  },
  runOuts: {
    label: "Run outs",
    shortLabel: "RO",
    category: "fielding",
    value: (stats) => stats.runOuts,
    display: (stats) => integer.format(stats.runOuts),
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

function matchKey(row: BattingRow | BowlingRow) {
  return `${row[5]}|${row[2]}|${row[4]}`;
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
  stats.matches.add(matchKey(row));
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
  stats.matches.add(matchKey(row));
}

function aggregateRows(batting: BattingRow[], bowling: BowlingRow[]) {
  const stats = new Map<string, PlayerStats>();
  const get = (name: string) => {
    let current = stats.get(name);
    if (!current) {
      current = newStats(name);
      stats.set(name, current);
    }
    return current;
  };
  for (const row of batting) addBatting(get(row[0]), row);
  for (const row of bowling) addBowling(get(row[0]), row);
  return stats;
}

function canonicalOpponent(rawOpponent: string) {
  const raw = (rawOpponent || "").trim().replace(/\s+/g, " ");
  if (!raw) return "Unknown opposition";

  const aliases: [RegExp, string][] = [
    [/^(?:intra[\s-]?club|interclub game)/i, "Edinburgh South"],
    [/^edinburgh south\b/i, "Edinburgh South"],
    [/^carlton\b/i, "Carlton"],
    [/^edinburgh (?:accies|academicals)\b/i, "Edinburgh Academicals"],
    [/^dunfermline\b/i, "Dunfermline & Carnegie"],
    [/^drummond trin(?:ity|ithy)\b/i, "Drummond Trinity"],
    [/^clackmann(?:an|on)(?: county)?\b/i, "Clackmannan County"],
    [/^heriot(?:'s|s)\b/i, "Heriot's"],
    [/^holy cross\b/i, "Holy Cross"],
    [/^leith\b/i, "Leith FAB"],
    [/^(?:kirk\s*brae|kirkbrae)\b/i, "Kirk Brae"],
    [/^fauldhouse\b/i, "Fauldhouse"],
    [/^e\s*=\s*mcc2?\b/i, "E=MCC"],
    [/^esca\b/i, "ESCA"],
    [/^ghk\b/i, "GHK"],
    [/^mdafs\b/i, "MDAFS"],
  ];
  const directAlias = aliases.find(([pattern]) => pattern.test(raw));
  if (directAlias) return directAlias[1];

  let name = raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\bcricket club\b/gi, "")
    .replace(/\bc\.?\s*c\.?\b/gi, "")
    .replace(
      /\s+(?:[1-6](?:st|nd|rd|th)?(?:\s*xi)?|[1-6](?:s|nds|rds|ths)|firsts?|seconds?|thirds?|fourths?|fifths?|sixths?|ii'?s?|xi|x1|development(?:\s+xi)?|ladies|women(?:'s)?)\b.*$/i,
      "",
    )
    .replace(/\s*\/\s*mitres.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedAlias = aliases.find(([pattern]) => pattern.test(name));
  if (cleanedAlias) return cleanedAlias[1];
  if (!name) return raw;

  return name
    .split(" ")
    .map((word) => {
      if (/^[A-Z&=]{2,}$/.test(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function playerKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function rowPassesFilters(
  row: BattingRow | BowlingRow,
  filters: PerformanceFilters,
) {
  return (
    row[1] >= filters.startYear &&
    row[1] <= filters.endYear &&
    (filters.team === "All teams" || row[2] === filters.team) &&
    (filters.matchType === "All match types" ||
      row[3] === filters.matchType) &&
    (!filters.opposition.trim() ||
      canonicalOpponent(row[4])
        .toLowerCase()
        .includes(filters.opposition.trim().toLowerCase()))
  );
}

function yearLabel(startYear: number, endYear: number) {
  return startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
}

function initials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function defaultDirection(metric: MetricKey): "asc" | "desc" {
  return metrics[metric].ascending ? "asc" : "desc";
}

export function RecordsExplorer() {
  const [data, setData] = useState<RecordsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<PerformanceFilters>({
    startYear: 2004,
    endYear: 2025,
    team: "All teams",
    matchType: "All match types",
    opposition: "",
  });
  const [minimumAppearances, setMinimumAppearances] = useState(0);
  const [metric, setMetric] = useState<MetricKey>("runs");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");
  const [recordFilters, setRecordFilters] = useState<PerformanceFilters>({
    startYear: 2004,
    endYear: 2025,
    team: "All teams",
    matchType: "All match types",
    opposition: "",
  });

  useEffect(() => {
    let active = true;
    fetch("/data/records.json")
      .then((response) => {
        if (!response.ok) throw new Error("Records could not be loaded");
        return response.json();
      })
      .then((records: RecordsData) => {
        if (!active) return;
        const initialFilters = {
          startYear: records.meta.seasonStart,
          endYear: records.meta.seasonEnd,
          team: "All teams",
          matchType: "All match types",
          opposition: "",
        };
        setData(records);
        setFilters(initialFilters);
        setRecordFilters(initialFilters);
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

  useEffect(() => {
    setVisibleLimit(100);
  }, [filters, metric, minimumAppearances, sortDirection]);

  const filtered = useMemo(() => {
    if (!data) return { batting: [], bowling: [] };
    return {
      batting: data.batting.filter((row) => rowPassesFilters(row, filters)),
      bowling: data.bowling.filter((row) => rowPassesFilters(row, filters)),
    };
  }, [data, filters]);

  const statsByPlayer = useMemo(
    () => aggregateRows(filtered.batting, filtered.bowling),
    [filtered],
  );

  const allTimeAppearances = useMemo(() => {
    if (!data) return new Map<string, number>();
    const allTimeStats = aggregateRows(data.batting, data.bowling);
    return new Map(
      [...allTimeStats].map(([name, stats]) => [name, stats.matches.size]),
    );
  }, [data]);

  const canonicalOpponents = useMemo(() => {
    if (!data) return [];
    return [
      ...new Set(
        [...data.batting, ...data.bowling].map((row) =>
          canonicalOpponent(row[4]),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const boundaryByPlayer = useMemo(() => {
    if (!data) return new Map<string, { fours: number; sixes: number }>();
    return new Map(
      data.boundaries.map(([name, fours, sixes]) => [
        playerKey(name),
        { fours, sixes },
      ]),
    );
  }, [data]);

  const leaderboard = useMemo(() => {
    const definition = metrics[metric];
    return [...statsByPlayer.values()]
      .filter(
        (stats) =>
          (allTimeAppearances.get(stats.name) ?? 0) >= minimumAppearances,
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
      .sort((a, b) => {
        const result = a.value - b.value;
        if (result === 0) return a.stats.name.localeCompare(b.stats.name);
        return sortDirection === "asc" ? result : -result;
      });
  }, [
    allTimeAppearances,
    metric,
    minimumAppearances,
    sortDirection,
    statsByPlayer,
  ]);

  const displayedLeaderboard = leaderboard.slice(0, visibleLimit);

  const archiveSummary = useMemo(() => {
    const eligibleNames = new Set(
      [...statsByPlayer.values()]
        .filter(
          (stats) =>
            (allTimeAppearances.get(stats.name) ?? 0) >= minimumAppearances,
        )
        .map((stats) => stats.name),
    );
    const eligibleBatting = filtered.batting.filter((row) =>
      eligibleNames.has(row[0]),
    );
    const eligibleBowling = filtered.bowling.filter((row) =>
      eligibleNames.has(row[0]),
    );
    const seasons = new Set([
      ...eligibleBatting.map((row) => row[1]),
      ...eligibleBowling.map((row) => row[1]),
    ]);
    return {
      performances: eligibleBatting.length + eligibleBowling.length,
      players: eligibleNames.size,
      seasons: seasons.size,
    };
  }, [
    allTimeAppearances,
    filtered,
    minimumAppearances,
    statsByPlayer,
  ]);

  const selectedRows = useMemo(() => {
    if (!data || !openPlayer) return { batting: [], bowling: [] };
    return {
      batting: data.batting.filter(
        (row) =>
          row[0] === openPlayer && rowPassesFilters(row, recordFilters),
      ),
      bowling: data.bowling.filter(
        (row) =>
          row[0] === openPlayer && rowPassesFilters(row, recordFilters),
      ),
    };
  }, [data, openPlayer, recordFilters]);

  const selectedStats = useMemo(() => {
    if (!openPlayer) return null;
    return (
      aggregateRows(selectedRows.batting, selectedRows.bowling).get(openPlayer) ??
      newStats(openPlayer)
    );
  }, [openPlayer, selectedRows]);

  const selectedBoundaries = openPlayer
    ? boundaryByPlayer.get(playerKey(openPlayer)) ?? { fours: 0, sixes: 0 }
    : { fours: 0, sixes: 0 };

  const seasonTrend = useMemo(() => {
    if (!openPlayer) return [];
    const points: { season: number; value: number; display: string }[] = [];
    for (
      let season = recordFilters.startYear;
      season <= recordFilters.endYear;
      season += 1
    ) {
      const seasonStats = newStats(openPlayer);
      for (const row of selectedRows.batting) {
        if (row[1] === season) addBatting(seasonStats, row);
      }
      for (const row of selectedRows.bowling) {
        if (row[1] === season) addBowling(seasonStats, row);
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
  }, [metric, openPlayer, recordFilters, selectedRows]);

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

  function chooseMetric(nextMetric: MetricKey) {
    if (nextMetric === metric) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setMetric(nextMetric);
    setSortDirection(defaultDirection(nextMetric));
  }

  function openPlayerRecord(name: string) {
    setRecordFilters(filters);
    setOpenPlayer(name);
  }

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
      openPlayerRecord(match);
      setPlayerQuery("");
    }
  }

  if (loadError) {
    return (
      <main className="status-screen">
        <img src="/escc-logo.png" alt="Edinburgh South CC" />
        <h1>The vault is temporarily unavailable.</h1>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="status-screen" aria-live="polite">
        <img src="/escc-logo.png" alt="Edinburgh South CC" />
        <div className="loading-line" />
        <p>Opening the vault…</p>
      </main>
    );
  }

  const records = data;
  const seasonOptions = Array.from(
    { length: records.meta.seasonEnd - records.meta.seasonStart + 1 },
    (_, index) => records.meta.seasonStart + index,
  );

  function renderMetricOptions() {
    return (
      <>
        <optgroup label="General">
          <option value="matches">Appearances</option>
        </optgroup>
        <optgroup label="Batting">
          <option value="innings">Batting innings</option>
          <option value="runs">Batting runs</option>
          <option value="battingAverage">Batting average</option>
          <option value="highScore">Highest score</option>
          <option value="fifties">Fifties</option>
          <option value="hundreds">Hundreds</option>
        </optgroup>
        <optgroup label="Bowling">
          <option value="overs">Overs bowled</option>
          <option value="wickets">Bowling wickets</option>
          <option value="bowlingAverage">Bowling average</option>
          <option value="economy">Economy rate</option>
          <option value="bestBowling">Best bowling</option>
        </optgroup>
        <optgroup label="Fielding">
          <option value="catches">Catches</option>
          <option value="stumpings">Stumpings</option>
          <option value="runOuts">Run outs</option>
        </optgroup>
      </>
    );
  }

  function updateFilters(
    setter: React.Dispatch<React.SetStateAction<PerformanceFilters>>,
    update: Partial<PerformanceFilters>,
  ) {
    setter((current) => ({ ...current, ...update }));
  }

  function renderPerformanceFilters(
    values: PerformanceFilters,
    setter: React.Dispatch<React.SetStateAction<PerformanceFilters>>,
    prefix: string,
    includeAppearances: boolean,
  ) {
    return (
      <div className="filters" aria-label={`${prefix} performance filters`}>
        <label>
          <span>From season</span>
          <select
            value={values.startYear}
            onChange={(event) =>
              updateFilters(setter, {
                startYear: Math.min(
                  Number(event.target.value),
                  values.endYear,
                ),
              })
            }
          >
            {seasonOptions.map((season) => (
              <option key={season}>{season}</option>
            ))}
          </select>
        </label>
        <label>
          <span>To season</span>
          <select
            value={values.endYear}
            onChange={(event) =>
              updateFilters(setter, {
                endYear: Math.max(
                  Number(event.target.value),
                  values.startYear,
                ),
              })
            }
          >
            {seasonOptions.map((season) => (
              <option key={season}>{season}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Team</span>
          <select
            value={values.team}
            onChange={(event) =>
              updateFilters(setter, { team: event.target.value })
            }
          >
            <option>All teams</option>
            {records.meta.teams.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Match type</span>
          <select
            value={values.matchType}
            onChange={(event) =>
              updateFilters(setter, { matchType: event.target.value })
            }
          >
            <option>All match types</option>
            {records.meta.matchTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Opposition</span>
          <input
            list={`${prefix}-oppositions`}
            value={values.opposition}
            onChange={(event) =>
              updateFilters(setter, { opposition: event.target.value })
            }
            placeholder="All opponents"
          />
          <datalist id={`${prefix}-oppositions`}>
            {canonicalOpponents.map((item) => (
              <option value={item} key={item} />
            ))}
          </datalist>
        </label>
        {includeAppearances && (
          <label>
            <span>Club appearances</span>
            <select
              value={minimumAppearances}
              onChange={(event) =>
                setMinimumAppearances(Number(event.target.value))
              }
            >
              <option value="0">Any</option>
              <option value="5">5+</option>
              <option value="10">10+</option>
              <option value="25">25+</option>
              <option value="50">50+</option>
              <option value="100">100+</option>
              <option value="200">200+</option>
            </select>
          </label>
        )}
      </div>
    );
  }

  function resetRankingFilters() {
    setFilters({
      startYear: records.meta.seasonStart,
      endYear: records.meta.seasonEnd,
      team: "All teams",
      matchType: "All match types",
      opposition: "",
    });
    setMinimumAppearances(0);
  }

  function resetRecordFilters() {
    setRecordFilters({
      startYear: records.meta.seasonStart,
      endYear: records.meta.seasonEnd,
      team: "All teams",
      matchType: "All match types",
      opposition: "",
    });
  }

  const sortArrow = sortDirection === "asc" ? "↑" : "↓";

  function sortableHeader(key: MetricKey, label: string) {
    const active = metric === key;
    return (
      <th
        className={active ? "active-sort" : ""}
        aria-sort={
          active
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button type="button" onClick={() => chooseMetric(key)}>
          {label}
          <span aria-hidden="true">{active ? sortArrow : "↕"}</span>
        </button>
      </th>
    );
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="The Inch Park Vault">
          <img src="/escc-logo.png" alt="" />
          <span>
            <strong>The Inch Park Vault</strong>
            <small>Edinburgh South CC performance archive</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#rankings">Rankings</a>
          <a
            href="https://www.edinburghsouthcc.org"
            target="_blank"
            rel="noreferrer"
          >
            Club website <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className="ranking-hero" id="top">
        <div className="ranking-intro">
          <p className="eyebrow">Edinburgh South CC performance archive</p>
          <h1>
            The Inch Park <em>Vault.</em>
          </h1>
        </div>
        <label className="metric-selector">
          <span>Rank players by</span>
          <select
            value={metric}
            onChange={(event) =>
              chooseMetric(event.target.value as MetricKey)
            }
          >
            {renderMetricOptions()}
          </select>
          <small>
            {sortDirection === "asc" ? "Lowest first" : "Highest first"}
          </small>
        </label>
      </section>

      <section className="archive-stats" aria-label="Filtered archive summary">
        <div>
          <strong>{integer.format(archiveSummary.performances)}</strong>
          <span>Performances</span>
        </div>
        <div>
          <strong>{integer.format(archiveSummary.players)}</strong>
          <span>Players</span>
        </div>
        <div>
          <strong>{integer.format(archiveSummary.seasons)}</strong>
          <span>Seasons</span>
        </div>
      </section>

      <section className="rankings-shell" id="rankings">
        <div className="rankings-toolbar">
          <div>
            <p className="eyebrow">Player rankings</p>
            <label className="ranking-title-select">
              <span className="visually-hidden">Ranking criterion</span>
              <select
                value={metric}
                onChange={(event) =>
                  chooseMetric(event.target.value as MetricKey)
                }
              >
                {renderMetricOptions()}
              </select>
            </label>
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
          <span>Filters</span>
          <button type="button" onClick={resetRankingFilters}>
            Reset
          </button>
        </div>
        {renderPerformanceFilters(filters, setFilters, "ranking", true)}

        <div className="results-context" aria-live="polite">
          {(filters.startYear !== data.meta.seasonStart ||
            filters.endYear !== data.meta.seasonEnd) && (
            <button
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  startYear: data.meta.seasonStart,
                  endYear: data.meta.seasonEnd,
                }))
              }
              aria-label="Remove season filter"
            >
              {yearLabel(filters.startYear, filters.endYear)}
              <span aria-hidden="true">×</span>
            </button>
          )}
          {filters.team !== "All teams" && (
            <button
              type="button"
              onClick={() =>
                setFilters((current) => ({ ...current, team: "All teams" }))
              }
              aria-label={`Remove ${filters.team} filter`}
            >
              {filters.team}
              <span aria-hidden="true">×</span>
            </button>
          )}
          {filters.matchType !== "All match types" && (
            <button
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  matchType: "All match types",
                }))
              }
              aria-label={`Remove ${filters.matchType} filter`}
            >
              {filters.matchType}
              <span aria-hidden="true">×</span>
            </button>
          )}
          {filters.opposition && (
            <button
              type="button"
              onClick={() =>
                setFilters((current) => ({ ...current, opposition: "" }))
              }
              aria-label={`Remove ${filters.opposition} opposition filter`}
            >
              vs {filters.opposition}
              <span aria-hidden="true">×</span>
            </button>
          )}
          {minimumAppearances > 0 && (
            <button
              type="button"
              onClick={() => setMinimumAppearances(0)}
              aria-label="Remove club appearances filter"
            >
              {minimumAppearances}+ club appearances
              <span aria-hidden="true">×</span>
            </button>
          )}
          <strong>{integer.format(leaderboard.length)} players</strong>
        </div>

        <div className="stats-table-wrap">
          <table className="stats-table">
            <caption>
              Players ranked by {metrics[metric].label.toLowerCase()}.
            </caption>
            <thead>
              <tr>
                <th className="rank-col">Rank</th>
                <th className="player-col">Player</th>
                {sortableHeader("matches", "Mat")}
                {sortableHeader("innings", "Inn")}
                {sortableHeader("runs", "Runs")}
                {sortableHeader("battingAverage", "Bat avg")}
                {sortableHeader("highScore", "HS")}
                {sortableHeader("fifties", "50s")}
                {sortableHeader("hundreds", "100s")}
                {sortableHeader("overs", "Overs")}
                {sortableHeader("wickets", "Wkts")}
                {sortableHeader("bowlingAverage", "Bowl avg")}
                {sortableHeader("economy", "Econ")}
                {sortableHeader("bestBowling", "BB")}
                {sortableHeader("catches", "Ct")}
                {sortableHeader("stumpings", "St")}
                {sortableHeader("runOuts", "RO")}
              </tr>
            </thead>
            <tbody>
              {displayedLeaderboard.map(({ stats }, index) => (
                <tr key={stats.name}>
                  <td className="rank-col">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <th scope="row" className="player-col">
                    <button
                      type="button"
                      onClick={() => openPlayerRecord(stats.name)}
                      aria-label={`Open ${stats.name} player record`}
                    >
                      <span>{stats.name}</span>
                      <span className="player-link-icon" aria-hidden="true">
                        ↗
                      </span>
                    </button>
                  </th>
                  <td className={metric === "matches" ? "active-sort" : ""}>
                    {integer.format(stats.matches.size)}
                  </td>
                  <td className={metric === "innings" ? "active-sort" : ""}>
                    {integer.format(stats.innings)}
                  </td>
                  <td className={metric === "runs" ? "active-sort" : ""}>
                    {integer.format(stats.battingRuns)}
                  </td>
                  <td
                    className={
                      metric === "battingAverage" ? "active-sort" : ""
                    }
                  >
                    {metrics.battingAverage.display(stats)}
                  </td>
                  <td className={metric === "highScore" ? "active-sort" : ""}>
                    {integer.format(stats.highScore)}
                  </td>
                  <td className={metric === "fifties" ? "active-sort" : ""}>
                    {integer.format(stats.fifties)}
                  </td>
                  <td className={metric === "hundreds" ? "active-sort" : ""}>
                    {integer.format(stats.hundreds)}
                  </td>
                  <td className={metric === "overs" ? "active-sort" : ""}>
                    {overs(stats.balls)}
                  </td>
                  <td className={metric === "wickets" ? "active-sort" : ""}>
                    {integer.format(stats.wickets)}
                  </td>
                  <td
                    className={
                      metric === "bowlingAverage" ? "active-sort" : ""
                    }
                  >
                    {metrics.bowlingAverage.display(stats)}
                  </td>
                  <td className={metric === "economy" ? "active-sort" : ""}>
                    {metrics.economy.display(stats)}
                  </td>
                  <td
                    className={metric === "bestBowling" ? "active-sort" : ""}
                  >
                    {metrics.bestBowling.display(stats)}
                  </td>
                  <td className={metric === "catches" ? "active-sort" : ""}>
                    {integer.format(stats.catches)}
                  </td>
                  <td className={metric === "stumpings" ? "active-sort" : ""}>
                    {integer.format(stats.stumpings)}
                  </td>
                  <td className={metric === "runOuts" ? "active-sort" : ""}>
                    {integer.format(stats.runOuts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {leaderboard.length === 0 && (
            <p className="empty-state">No matching performances.</p>
          )}
        </div>

        {leaderboard.length > visibleLimit && (
          <div className="load-more">
            <span>
              Showing {integer.format(visibleLimit)} of{" "}
              {integer.format(leaderboard.length)}
            </span>
            <button
              type="button"
              onClick={() =>
                setVisibleLimit((current) =>
                  Math.min(current + 100, leaderboard.length),
                )
              }
            >
              Show next {Math.min(100, leaderboard.length - visibleLimit)}
            </button>
          </div>
        )}
      </section>

      <footer>
        <div>
          <img src="/escc-logo.png" alt="" />
          <p>The Inch Park Vault</p>
        </div>
        <p>Edinburgh South CC performance archive</p>
      </footer>

      {openPlayer && selectedStats && (
        <div
          className="player-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenPlayer(null);
          }}
        >
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
                  <p className="eyebrow">Player record</p>
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

            <div className="record-filters">
              <div className="filters-heading">
                <span>Filter this record</span>
                <button type="button" onClick={resetRecordFilters}>
                  Reset
                </button>
              </div>
              {renderPerformanceFilters(
                recordFilters,
                setRecordFilters,
                "record",
                false,
              )}
            </div>

            <div className="record-filter-context">
              <span>
                {yearLabel(recordFilters.startYear, recordFilters.endYear)}
              </span>
              <span>{recordFilters.team}</span>
              <span>{recordFilters.matchType}</span>
              {recordFilters.opposition && (
                <span>vs {recordFilters.opposition}</span>
              )}
            </div>

            <div className="player-stat-grid">
              <div>
                <span>Matches</span>
                <strong>{integer.format(selectedStats.matches.size)}</strong>
              </div>
              <div>
                <span>Runs</span>
                <strong>{integer.format(selectedStats.battingRuns)}</strong>
              </div>
              <div>
                <span>Batting average</span>
                <strong>
                  {metrics.battingAverage.display(selectedStats)}
                </strong>
              </div>
              <div>
                <span>High score</span>
                <strong>{integer.format(selectedStats.highScore)}</strong>
              </div>
              <div>
                <span>Fifties</span>
                <strong>{integer.format(selectedStats.fifties)}</strong>
              </div>
              <div>
                <span>Hundreds</span>
                <strong>{integer.format(selectedStats.hundreds)}</strong>
              </div>
              <div>
                <span>Fours (career)</span>
                <strong>{integer.format(selectedBoundaries.fours)}</strong>
              </div>
              <div>
                <span>Sixes (career)</span>
                <strong>{integer.format(selectedBoundaries.sixes)}</strong>
              </div>
              <div>
                <span>Wickets</span>
                <strong>{integer.format(selectedStats.wickets)}</strong>
              </div>
              <div>
                <span>Overs</span>
                <strong>{overs(selectedStats.balls)}</strong>
              </div>
              <div>
                <span>Bowling average</span>
                <strong>
                  {metrics.bowlingAverage.display(selectedStats)}
                </strong>
              </div>
              <div>
                <span>Economy</span>
                <strong>{metrics.economy.display(selectedStats)}</strong>
              </div>
              <div>
                <span>Best bowling</span>
                <strong>{metrics.bestBowling.display(selectedStats)}</strong>
              </div>
              <div>
                <span>Catches</span>
                <strong>{integer.format(selectedStats.catches)}</strong>
              </div>
              <div>
                <span>Stumpings</span>
                <strong>{integer.format(selectedStats.stumpings)}</strong>
              </div>
              <div>
                <span>Run outs</span>
                <strong>{integer.format(selectedStats.runOuts)}</strong>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-title">
                <div>
                  <span>{metrics[metric].label} by season</span>
                  <strong>{metrics[metric].display(selectedStats)}</strong>
                </div>
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
                      chart.maximum -
                      position * (chart.maximum - chart.minimum);
                    return (
                      <g key={position}>
                        <line x1="42" x2="818" y1={y} y2={y} />
                        <text x="4" y={y + 4}>
                          {Number.isInteger(value)
                            ? integer.format(value)
                            : value.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
                  <polyline
                    className="chart-area"
                    points={`42,258 ${chart.path} 818,258`}
                  />
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
                          y="284"
                          textAnchor="middle"
                        >
                          {point.season}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              ) : (
                <p className="empty-state">No data for this selection.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
