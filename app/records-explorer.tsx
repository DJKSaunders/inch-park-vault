"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { canonicalOpponent, displayOpponent } from "./opponents";
import { SiteHeader } from "./site-header";
import {
  capEntryForName,
  capEntryForNumber,
  capEntryForPlayerId,
  capSearchNumber,
  capTooltip,
} from "./cap-numbers";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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
    asOfDate?: string;
    teams: string[];
    matchTypes: string[];
    oppositions: string[];
    playerNames: string[];
  };
  batting: BattingRow[];
  bowling: BowlingRow[];
  boundaries: [string, number, number][];
};

type PlayerIdentityLink = {
  playerId: string;
  scorecardName: string;
  path: string;
  appearanceCount: number;
  battingInningsCount: number;
  bowlingSpellCount: number;
  matchMethod: "normalized-exact";
};

type RecordsPlayerMap = {
  players: Record<string, PlayerIdentityLink | null>;
  directory: {
    playerId: string;
    aliases: string[];
  }[];
};

type ScorecardAppearance = {
  fixtureId: string;
  date: string;
  season: number;
  team: string | null;
  opposition: string | null;
  competition: string | null;
  outcome: string;
  didNotBat: boolean;
};

type ScorecardBattingInnings = {
  playerId: string;
  fixtureId: string;
  season: number;
  team: string | null;
  opposition: string | null;
  competition: string | null;
  runs: number | null;
  balls: number | null;
  notOut: boolean;
  fours: number | null;
  sixes: number | null;
};

type ScorecardBowlingSpell = {
  fixtureId: string;
  overs: string | null;
  runs: number | null;
  wickets: number | null;
};

type ScorecardPlayerHistory = {
  playerId: string;
  name: string;
  appearances: ScorecardAppearance[];
  battingInnings: ScorecardBattingInnings[];
  bowlingSpells: ScorecardBowlingSpell[];
};

function formatArchiveDate(value: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function latestRecordDate(records: RecordsData) {
  if (records.meta.asOfDate) return records.meta.asOfDate;

  let latest = "";
  for (const row of [...records.batting, ...records.bowling]) {
    if (row[5] > latest) latest = row[5];
  }
  return latest;
}

type PlayerStats = {
  name: string;
  battingRuns: number;
  innings: number;
  outs: number;
  highScore: number;
  highScoreNotOut: boolean;
  hundreds: number;
  fifties: number;
  fours: number;
  sixes: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  balls: number;
  battingBalls: number;
  battingRunsWithBalls: number;
  battingInningsWithBalls: number;
  maidens: number;
  bowlingRuns: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
  fiveWicketHauls: number;
  matches: Set<string>;
};

type MetricKey =
  | "matches"
  | "innings"
  | "runs"
  | "battingAverage"
  | "battingStrikeRate"
  | "highScore"
  | "notOuts"
  | "fifties"
  | "hundreds"
  | "fours"
  | "sixes"
  | "overs"
  | "maidens"
  | "wickets"
  | "fiveWicketHauls"
  | "bowlingAverage"
  | "economy"
  | "bowlingStrikeRate"
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

type SectionKey = "batting" | "bowling" | "performances";
type PerformanceDiscipline = "batting" | "bowling";

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
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
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

function battingStrikeRateValue(stats: PlayerStats) {
  return stats.battingBalls > 0
    ? (stats.battingRunsWithBalls * 100) / stats.battingBalls
    : null;
}

function bowlingStrikeRateValue(stats: PlayerStats) {
  return stats.wickets > 0 ? stats.balls / stats.wickets : null;
}

function overs(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function matchDate(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : shortDate.format(parsed);
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
  battingStrikeRate: {
    label: "Batting strike rate",
    shortLabel: "Bat SR",
    category: "batting",
    value: battingStrikeRateValue,
    display: (stats) => {
      const value = battingStrikeRateValue(stats);
      return value === null ? "—" : decimal.format(value);
    },
  },
  highScore: {
    label: "Highest score",
    shortLabel: "HS",
    category: "batting",
    value: (stats) => stats.highScore,
    display: (stats) =>
      `${integer.format(stats.highScore)}${stats.highScoreNotOut ? "*" : ""}`,
  },
  notOuts: {
    label: "Not outs",
    shortLabel: "NO",
    category: "batting",
    value: (stats) => stats.innings - stats.outs,
    display: (stats) => integer.format(stats.innings - stats.outs),
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
  fours: {
    label: "Career fours",
    shortLabel: "4s",
    category: "batting",
    value: (stats) => stats.fours,
    display: (stats) => integer.format(stats.fours),
  },
  sixes: {
    label: "Career sixes",
    shortLabel: "6s",
    category: "batting",
    value: (stats) => stats.sixes,
    display: (stats) => integer.format(stats.sixes),
  },
  overs: {
    label: "Overs bowled",
    shortLabel: "Overs",
    category: "bowling",
    value: (stats) => stats.balls,
    display: (stats) => overs(stats.balls),
  },
  maidens: {
    label: "Maidens",
    shortLabel: "Mdns",
    category: "bowling",
    value: (stats) => stats.maidens,
    display: (stats) => integer.format(stats.maidens),
  },
  wickets: {
    label: "Bowling wickets",
    shortLabel: "Wkts",
    category: "bowling",
    value: (stats) => stats.wickets,
    display: (stats) => integer.format(stats.wickets),
  },
  fiveWicketHauls: {
    label: "Five-wicket hauls",
    shortLabel: "5WI",
    category: "bowling",
    value: (stats) => stats.fiveWicketHauls,
    display: (stats) => integer.format(stats.fiveWicketHauls),
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
  bowlingStrikeRate: {
    label: "Bowling strike rate",
    shortLabel: "Bowl SR",
    category: "bowling",
    ascending: true,
    value: bowlingStrikeRateValue,
    display: (stats) => {
      const value = bowlingStrikeRateValue(stats);
      return value === null ? "—" : decimal.format(value);
    },
  },
  bestBowling: {
    label: "Best bowling",
    shortLabel: "BB",
    category: "bowling",
    value: (stats) => (stats.bestWickets > 0 ? stats.bestWickets : null),
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

const battingMetricKeys: MetricKey[] = [
  "matches",
  "innings",
  "runs",
  "battingAverage",
  "battingStrikeRate",
  "highScore",
  "notOuts",
  "fifties",
  "hundreds",
  "fours",
  "sixes",
];

const bowlingMetricKeys: MetricKey[] = [
  "matches",
  "overs",
  "maidens",
  "wickets",
  "fiveWicketHauls",
  "bowlingAverage",
  "economy",
  "bowlingStrikeRate",
  "bestBowling",
  "catches",
  "stumpings",
  "runOuts",
];

function newStats(name: string): PlayerStats {
  return {
    name,
    battingRuns: 0,
    innings: 0,
    outs: 0,
    highScore: 0,
    highScoreNotOut: false,
    hundreds: 0,
    fifties: 0,
    fours: 0,
    sixes: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    balls: 0,
    battingBalls: 0,
    battingRunsWithBalls: 0,
    battingInningsWithBalls: 0,
    maidens: 0,
    bowlingRuns: 0,
    wickets: 0,
    bestWickets: 0,
    bestRuns: Number.POSITIVE_INFINITY,
    fiveWicketHauls: 0,
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
    if (runs > stats.highScore) {
      stats.highScore = runs;
      stats.highScoreNotOut = row[7];
    } else if (runs === stats.highScore && row[7]) {
      stats.highScoreNotOut = true;
    }
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
  if (row[9] >= 5) stats.fiveWicketHauls += 1;
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

function scorecardInningsPassesFilters(
  innings: ScorecardBattingInnings,
  filters: PerformanceFilters,
) {
  return (
    innings.season >= filters.startYear &&
    innings.season <= filters.endYear &&
    (filters.team === "All teams" || innings.team === filters.team) &&
    (filters.matchType === "All match types" ||
      innings.competition === filters.matchType) &&
    (!filters.opposition.trim() ||
      canonicalOpponent(innings.opposition ?? "")
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
  const [identityMap, setIdentityMap] = useState<RecordsPlayerMap | null>(null);
  const [scorecardBatting, setScorecardBatting] = useState<
    ScorecardBattingInnings[]
  >([]);
  const [scorecardHistory, setScorecardHistory] =
    useState<ScorecardPlayerHistory | null>(null);
  const [historyErrorPlayerId, setHistoryErrorPlayerId] = useState<
    string | null
  >(null);
  const [historyLimit, setHistoryLimit] = useState(12);
  const [historySort, setHistorySort] = useState<"date" | "batting" | "bowling">("date");
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<PerformanceFilters>({
    startYear: 2004,
    endYear: 2025,
    team: "All teams",
    matchType: "All match types",
    opposition: "",
  });
  const [minimumAppearances, setMinimumAppearances] = useState(10);
  const [rankingMinimumAppearances, setRankingMinimumAppearances] = useState(10);
  const [activeSection, setActiveSection] = useState<SectionKey>("batting");
  const [performanceDiscipline, setPerformanceDiscipline] =
    useState<PerformanceDiscipline>("batting");
  const [metric, setMetric] = useState<MetricKey>("runs");
  const [profileMetric, setProfileMetric] = useState<MetricKey>("runs");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [performanceLimit, setPerformanceLimit] = useState(50);
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
    const iframeMode =
      window.self !== window.top ||
      new URLSearchParams(window.location.search).get("embed") === "1";
    document.body.classList.toggle("iframe-mode", iframeMode);
    return () => document.body.classList.remove("iframe-mode");
  }, []);

  useEffect(() => {
    fetch(`${publicBasePath}/data/scorecards/records-player-map.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Player links could not be loaded");
        return response.json() as Promise<RecordsPlayerMap>;
      })
      .then(setIdentityMap)
      .catch(() => setIdentityMap(null));

    fetch(`${publicBasePath}/data/scorecards/batting-innings.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Scorecard batting could not be loaded");
        return response.json() as Promise<ScorecardBattingInnings[]>;
      })
      .then(setScorecardBatting)
      .catch(() => setScorecardBatting([]));
  }, []);

  useEffect(() => {
    if (!openPlayer || !identityMap) return;
    const identity = identityMap.players[openPlayer];
    if (!identity || scorecardHistory?.playerId === identity.playerId) return;
    let active = true;
    fetch(`${publicBasePath}/data/scorecards/${identity.path}`)
      .then((response) => {
        if (!response.ok) throw new Error("Player history could not be loaded");
        return response.json() as Promise<ScorecardPlayerHistory>;
      })
      .then((history) => {
        if (active) setScorecardHistory(history);
      })
      .catch(() => {
        if (active) setHistoryErrorPlayerId(identity.playerId);
      });
    return () => {
      active = false;
    };
  }, [identityMap, openPlayer, scorecardHistory]);

  useEffect(() => {
    let active = true;
    fetch(`${publicBasePath}/data/records.json`)
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
    // Reset pagination whenever the ranking population or order changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleLimit(100);
  }, [filters, metric, minimumAppearances, sortDirection]);

  useEffect(() => {
    // Reset performance pagination whenever its population changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPerformanceLimit(50);
  }, [filters, performanceDiscipline]);

  const filtered = useMemo(() => {
    if (!data) return { batting: [], bowling: [] };
    return {
      batting: data.batting.filter((row) => rowPassesFilters(row, filters)),
      bowling: data.bowling.filter((row) => rowPassesFilters(row, filters)),
    };
  }, [data, filters]);

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

  const recordNameByPlayerId = useMemo(
    () =>
      new Map(
        Object.entries(identityMap?.players ?? {}).flatMap(([name, identity]) =>
          identity ? [[identity.playerId, name] as const] : [],
        ),
      ),
    [identityMap],
  );

  const statsByPlayer = useMemo(() => {
    const stats = aggregateRows(filtered.batting, filtered.bowling);
    for (const playerStats of stats.values()) {
      const boundaries = boundaryByPlayer.get(playerKey(playerStats.name));
      playerStats.fours = boundaries?.fours ?? 0;
      playerStats.sixes = boundaries?.sixes ?? 0;
    }
    for (const innings of scorecardBatting) {
      if (
        innings.balls === null ||
        innings.balls <= 0 ||
        innings.runs === null ||
        !scorecardInningsPassesFilters(innings, filters)
      ) {
        continue;
      }
      const recordName = recordNameByPlayerId.get(innings.playerId);
      if (!recordName) continue;
      const playerStats = stats.get(recordName);
      if (!playerStats) continue;
      playerStats.battingBalls += innings.balls;
      playerStats.battingRunsWithBalls += innings.runs;
      playerStats.battingInningsWithBalls += 1;
    }
    return stats;
  }, [boundaryByPlayer, filtered, filters, recordNameByPlayerId, scorecardBatting]);

  const leaderboard = useMemo(() => {
    const definition = metrics[metric];
    return [...statsByPlayer.values()]
      .filter(
        (stats) =>
          (allTimeAppearances.get(stats.name) ?? 0) >= minimumAppearances &&
          (activeSection === "batting"
            ? stats.innings > 0
            : stats.balls > 0 ||
              stats.catches > 0 ||
              stats.stumpings > 0 ||
              stats.runOuts > 0),
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
        if (metric === "bestBowling") {
          if (a.stats.bestWickets !== b.stats.bestWickets) {
            return sortDirection === "asc"
              ? a.stats.bestWickets - b.stats.bestWickets
              : b.stats.bestWickets - a.stats.bestWickets;
          }
          if (a.stats.bestRuns !== b.stats.bestRuns) {
            return sortDirection === "asc"
              ? b.stats.bestRuns - a.stats.bestRuns
              : a.stats.bestRuns - b.stats.bestRuns;
          }
          return a.stats.name.localeCompare(b.stats.name);
        }
        const result = a.value - b.value;
        if (result === 0) return a.stats.name.localeCompare(b.stats.name);
        return sortDirection === "asc" ? result : -result;
      });
  }, [
    activeSection,
    allTimeAppearances,
    metric,
    minimumAppearances,
    sortDirection,
    statsByPlayer,
  ]);

  const displayedLeaderboard = leaderboard.slice(0, visibleLimit);

  const performanceRows = useMemo(() => {
    if (performanceDiscipline === "batting") {
      return filtered.batting
        .filter((row) => !row[8] && typeof row[6] === "number")
        .sort(
          (left, right) =>
            (right[6] as number) - (left[6] as number) ||
            Number(right[7]) - Number(left[7]) ||
            right[5].localeCompare(left[5]),
        );
    }
    return filtered.bowling
      .filter((row) => row[6] > 0)
      .sort(
        (left, right) =>
          right[9] - left[9] ||
          left[8] - right[8] ||
          left[6] - right[6] ||
          right[5].localeCompare(left[5]),
      );
  }, [filtered, performanceDiscipline]);

  const topPerformances = performanceRows.slice(0, performanceLimit);

  const archiveSummary = useMemo(() => {
    if (activeSection === "performances") {
      const rows =
        performanceDiscipline === "batting"
          ? filtered.batting.filter(
              (row) => !row[8] && typeof row[6] === "number",
            )
          : filtered.bowling.filter((row) => row[6] > 0);
      return {
        performances: rows.length,
        players: new Set(rows.map((row) => row[0])).size,
        matches: new Set(rows.map(matchKey)).size,
        seasons: new Set(rows.map((row) => row[1])).size,
      };
    }
    const eligibleNames = new Set(
      [...statsByPlayer.values()]
        .filter(
          (stats) =>
            (allTimeAppearances.get(stats.name) ?? 0) >= minimumAppearances &&
            (activeSection === "batting"
              ? stats.innings > 0
              : stats.balls > 0 ||
                stats.catches > 0 ||
                stats.stumpings > 0 ||
                stats.runOuts > 0),
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
      matches: new Set(
        [...eligibleBatting, ...eligibleBowling].map(matchKey),
      ).size,
      seasons: seasons.size,
    };
  }, [
    activeSection,
    allTimeAppearances,
    filtered,
    minimumAppearances,
    performanceDiscipline,
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

  const selectedIdentity =
    openPlayer && identityMap ? identityMap.players[openPlayer] : null;
  const profileIdByName = useMemo(
    () =>
      new Map(
        (identityMap?.directory ?? []).flatMap((player) =>
          player.aliases.map((alias) => [playerKey(alias), player.playerId]),
        ),
      ),
    [identityMap],
  );
  const activeScorecardHistory =
    selectedIdentity &&
    scorecardHistory?.playerId === selectedIdentity.playerId
      ? scorecardHistory
      : null;

  const seasonTrend = useMemo(() => {
    if (!openPlayer) return [];
    const points: { season: number; value: number; display: string }[] = [];
    const playingSeasons = [
      ...selectedRows.batting.filter((row) => row[0] === openPlayer).map((row) => row[1]),
      ...selectedRows.bowling.filter((row) => row[0] === openPlayer).map((row) => row[1]),
      ...(activeScorecardHistory?.appearances ?? [])
        .filter((appearance) =>
          appearance.season >= recordFilters.startYear &&
          appearance.season <= recordFilters.endYear)
        .map((appearance) => appearance.season),
    ];
    if (playingSeasons.length === 0) return points;
    const firstPlayingSeason = Math.max(recordFilters.startYear, Math.min(...playingSeasons));
    const lastPlayingSeason = Math.min(recordFilters.endYear, Math.max(...playingSeasons));
    const boundaryMetric =
      profileMetric === "fours" || profileMetric === "sixes"
        ? profileMetric
        : null;
    const eligibleFixtures = new Set(
      (activeScorecardHistory?.appearances ?? [])
        .filter(
          (appearance) =>
            appearance.season >= recordFilters.startYear &&
            appearance.season <= recordFilters.endYear &&
            (recordFilters.team === "All teams" ||
              appearance.team === recordFilters.team) &&
            (recordFilters.matchType === "All match types" ||
              appearance.competition === recordFilters.matchType) &&
            (!recordFilters.opposition ||
              canonicalOpponent(appearance.opposition ?? "")
                .toLocaleLowerCase()
                .includes(recordFilters.opposition.toLocaleLowerCase())),
        )
        .map((appearance) => appearance.fixtureId),
    );
    for (
      let season = firstPlayingSeason;
      season <= lastPlayingSeason;
      season += 1
    ) {
      if (boundaryMetric) {
        const available = (activeScorecardHistory?.battingInnings ?? []).filter(
          (innings) =>
            innings.season === season &&
            eligibleFixtures.has(innings.fixtureId) &&
            innings[boundaryMetric] !== null,
        );
        if (available.length > 0) {
          const value = available.reduce(
            (total, innings) => total + (innings[boundaryMetric] ?? 0),
            0,
          );
          points.push({
            season,
            value,
            display: integer.format(value),
          });
        }
        continue;
      }
      const seasonStats = newStats(openPlayer);
      for (const row of selectedRows.batting) {
        if (row[1] === season) addBatting(seasonStats, row);
      }
      for (const row of selectedRows.bowling) {
        if (row[1] === season) addBowling(seasonStats, row);
      }
      const value =
        profileMetric === "bestBowling"
          ? seasonStats.bestWickets > 0
            ? seasonStats.bestWickets
            : null
          : metrics[profileMetric].value(seasonStats);
      if (value !== null && Number.isFinite(value)) {
        points.push({
          season,
          value,
          display:
            profileMetric === "bestBowling"
              ? `${integer.format(seasonStats.bestWickets)} wickets`
              : metrics[profileMetric].display(seasonStats),
        });
      }
    }
    return points;
  }, [
    activeScorecardHistory,
    openPlayer,
    profileMetric,
    recordFilters,
    selectedRows,
  ]);

  const scorecardHistoryRows = useMemo(() => {
    if (!activeScorecardHistory) return [];
    return activeScorecardHistory.appearances
      .filter(
        (appearance) =>
          appearance.season >= recordFilters.startYear &&
          appearance.season <= recordFilters.endYear &&
          (recordFilters.team === "All teams" ||
            appearance.team === recordFilters.team) &&
          (recordFilters.matchType === "All match types" ||
            appearance.competition === recordFilters.matchType) &&
          (!recordFilters.opposition ||
            canonicalOpponent(appearance.opposition ?? "")
              .toLocaleLowerCase()
              .includes(recordFilters.opposition.toLocaleLowerCase())),
      )
      .map((appearance) => ({
        ...appearance,
        batting: activeScorecardHistory.battingInnings.filter(
          (innings) => innings.fixtureId === appearance.fixtureId,
        ),
        bowling: activeScorecardHistory.bowlingSpells.filter(
          (spell) => spell.fixtureId === appearance.fixtureId,
        ),
      }))
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.fixtureId.localeCompare(left.fixtureId),
      );
  }, [activeScorecardHistory, recordFilters]);

  const sortedScorecardHistoryRows = useMemo(() => {
    const rows = [...scorecardHistoryRows];
    const battingScore = (row: (typeof rows)[number]) =>
      Math.max(...row.batting.map((innings) => innings.runs ?? -1), -1);
    const bowlingFigures = (row: (typeof rows)[number]) => {
      const spells = row.bowling.map((spell) => ({ wickets: spell.wickets ?? 0, runs: spell.runs ?? Number.MAX_SAFE_INTEGER }));
      return spells.sort((left, right) => right.wickets - left.wickets || left.runs - right.runs)[0] ?? { wickets: -1, runs: Number.MAX_SAFE_INTEGER };
    };
    return rows.sort((left, right) => {
      if (historySort === "batting") return battingScore(right) - battingScore(left) || right.date.localeCompare(left.date);
      if (historySort === "bowling") {
        const leftFigures = bowlingFigures(left);
        const rightFigures = bowlingFigures(right);
        return rightFigures.wickets - leftFigures.wickets || leftFigures.runs - rightFigures.runs || right.date.localeCompare(left.date);
      }
      return right.date.localeCompare(left.date) || right.fixtureId.localeCompare(left.fixtureId);
    });
  }, [historySort, scorecardHistoryRows]);

  const scorecardHistorySummary = useMemo(
    () => ({
      appearances: scorecardHistoryRows.length,
      runs: scorecardHistoryRows.reduce(
        (total, row) =>
          total +
          row.batting.reduce(
            (inningsTotal, innings) => inningsTotal + (innings.runs ?? 0),
            0,
          ),
        0,
      ),
      wickets: scorecardHistoryRows.reduce(
        (total, row) =>
          total +
          row.bowling.reduce(
            (spellTotal, spell) => spellTotal + (spell.wickets ?? 0),
            0,
          ),
        0,
      ),
    }),
    [scorecardHistoryRows],
  );

  const scorecardSeasonSummaries = useMemo(() => {
    const seasons = new Map<
      number,
      { season: number; appearances: number; runs: number; wickets: number }
    >();
    for (const row of scorecardHistoryRows) {
      const summary = seasons.get(row.season) ?? {
        season: row.season,
        appearances: 0,
        runs: 0,
        wickets: 0,
      };
      summary.appearances += 1;
      summary.runs += row.batting.reduce(
        (total, innings) => total + (innings.runs ?? 0),
        0,
      );
      summary.wickets += row.bowling.reduce(
        (total, spell) => total + (spell.wickets ?? 0),
        0,
      );
      seasons.set(row.season, summary);
    }
    return [...seasons.values()].sort(
      (left, right) => right.season - left.season,
    );
  }, [scorecardHistoryRows]);

  const scorecardSeasonMaxima = useMemo(
    () => ({
      runs: Math.max(
        ...scorecardSeasonSummaries.map((summary) => summary.runs),
        1,
      ),
      wickets: Math.max(
        ...scorecardSeasonSummaries.map((summary) => summary.wickets),
        1,
      ),
    }),
    [scorecardSeasonSummaries],
  );

  const chart = useMemo(() => {
    const width = 860;
    const height = 300;
    const padX = 42;
    const padTop = 22;
    const padBottom = 42;
    const values = seasonTrend.map((point) => point.value);
    const maximum = Math.max(...values, 1);
    const minimum = metrics[profileMetric].ascending
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
    const tickValues =
      profileMetric === "bestBowling"
        ? [maximum, Math.floor(maximum / 2), 0]
        : [maximum, maximum - (maximum - minimum) / 2, minimum];
    return {
      width,
      height,
      points,
      path: points.map((point) => `${point.x},${point.y}`).join(" "),
      ticks: [...new Set(tickValues)].map((value) => ({
        value,
        y: y(value),
      })),
    };
  }, [profileMetric, seasonTrend]);

  function chooseMetric(nextMetric: MetricKey) {
    if (nextMetric === metric) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setMetric(nextMetric);
    setSortDirection(defaultDirection(nextMetric));
  }

  function chooseSection(nextSection: SectionKey) {
    setActiveSection(nextSection);
    if (nextSection === "performances") {
      setMinimumAppearances(0);
      return;
    }
    setMinimumAppearances(rankingMinimumAppearances);
    const nextMetric = nextSection === "batting" ? "runs" : "wickets";
    setMetric(nextMetric);
    setSortDirection(defaultDirection(nextMetric));
  }

  function openPlayerRecord(name: string, preferredMetric = metric) {
    setRecordFilters(filters);
    setHistoryLimit(12);
    setHistoryErrorPlayerId(null);
    setProfileMetric(preferredMetric);
    setOpenPlayer(name);
  }

  function openSearchedPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const query = playerQuery.trim().toLowerCase();
    const capEntry = capEntryForNumber(capSearchNumber(playerQuery));
    const capName = capEntry
      ? data.meta.playerNames.find(
          (name) =>
            identityMap?.players[name]?.playerId === capEntry.playerId ||
            capEntryForName(name)?.playerId === capEntry.playerId,
        )
      : undefined;
    const match =
      capName ??
      data.meta.playerNames.find((name) => name.toLowerCase() === query) ??
      data.meta.playerNames.find((name) =>
        name.toLowerCase().includes(query),
      );
    if (match) {
      openPlayerRecord(
        match,
        activeSection === "performances"
          ? performanceDiscipline === "batting"
            ? "runs"
            : "bestBowling"
          : metric,
      );
      setPlayerQuery("");
    }
  }

  if (loadError) {
    return (
      <main className="status-screen">
        <img
          src={`${publicBasePath}/escc-logo.png`}
          alt="Edinburgh South CC"
        />
        <h1>The vault is temporarily unavailable.</h1>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="status-screen" aria-live="polite">
        <img
          src={`${publicBasePath}/escc-logo.png`}
          alt="Edinburgh South CC"
        />
        <div className="loading-line" />
        <p>Opening the vault…</p>
      </main>
    );
  }

  const records = data;
  const archiveDate = formatArchiveDate(latestRecordDate(records));
  const seasonOptions = Array.from(
    { length: records.meta.seasonEnd - records.meta.seasonStart + 1 },
    (_, index) => records.meta.seasonStart + index,
  );
  const activeMetricKeys =
    activeSection === "batting" ? battingMetricKeys : bowlingMetricKeys;

  function renderPlayerReference(
    name: string,
    preferredMetric: MetricKey = metric,
  ) {
    const profileId = profileIdByName.get(playerKey(name));
    const capEntry = capEntryForPlayerId(profileId) ?? capEntryForName(name);
    const displayName = capEntry?.displayName ?? name;
    return (
      <span className="player-reference-actions">
        {profileId ? (
          <a href={`${publicBasePath}/players/${profileId}/`}>
            <span className="player-reference-name">
              <span>{displayName}</span>
              {capEntry && (
                <small title={capTooltip}>#{integer.format(capEntry.capNumber)}</small>
              )}
            </span>
            <span className="player-link-icon" aria-hidden="true">
              ↗
            </span>
          </a>
        ) : (
          <span className="player-reference-name">
            <span>{displayName}</span>
            {capEntry && (
              <small title={capTooltip}>#{integer.format(capEntry.capNumber)}</small>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => openPlayerRecord(name, preferredMetric)}
          aria-label={`Quick view ${name} record`}
        >
          Quick view
        </button>
      </span>
    );
  }

  function renderCriteriaMenu() {
    return (
      <details className="criteria-menu">
        <summary>
          <span>Rank by</span>
          <strong>{metrics[metric].label}</strong>
          <i aria-hidden="true">⌄</i>
        </summary>
        <div role="listbox" aria-label="Ranking criterion">
          {activeMetricKeys.map((key) => (
            <button
              type="button"
              role="option"
              aria-selected={metric === key}
              key={key}
              onClick={(event) => {
                if (metric !== key) chooseMetric(key);
                const details = event.currentTarget.closest(
                  "details",
                ) as HTMLDetailsElement | null;
                if (details) details.open = false;
              }}
            >
              {metrics[key].label}
              {metric === key && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </details>
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
              onChange={(event) => {
                const nextMinimum = Number(event.target.value);
                setMinimumAppearances(nextMinimum);
                setRankingMinimumAppearances(nextMinimum);
              }}
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
    setMinimumAppearances(10);
    setRankingMinimumAppearances(10);
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

  function profileStatCard(
    key: MetricKey,
    label: string,
    value: string,
  ) {
    return (
      <button
        type="button"
        className={profileMetric === key ? "active" : ""}
        onClick={() => setProfileMetric(key)}
        aria-pressed={profileMetric === key}
      >
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }

  return (
    <main className="vault-app">
      <SiteHeader active="records" />

      <section className="ranking-hero" id="top">
        <div className="ranking-intro">
          <p className="eyebrow">
            Edinburgh South Cricket Club Performance Archive –{" "}
            {yearLabel(records.meta.seasonStart, records.meta.seasonEnd)}
          </p>
          <h1>
            The Inch Park <em>Vault.</em>
          </h1>
        </div>
      </section>

      <p className="archive-as-of">
        Stats as of <strong>{archiveDate}</strong>
      </p>

      <section className="rankings-shell" id="rankings">
        <div className="section-tabs" role="tablist" aria-label="Statistics">
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "batting"}
            className={activeSection === "batting" ? "active" : ""}
            onClick={() => chooseSection("batting")}
          >
            Batting
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "bowling"}
            className={activeSection === "bowling" ? "active" : ""}
            onClick={() => chooseSection("bowling")}
          >
            Bowling <span>&amp; fielding</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "performances"}
            className={activeSection === "performances" ? "active" : ""}
            onClick={() => chooseSection("performances")}
          >
            Top <span>performances</span>
          </button>
        </div>

        <div className="rankings-toolbar">
          {activeSection === "performances" ? (
            <div className="performance-heading">
              <span>All-time rankings</span>
              <strong>Top performances</strong>
              <div
                className="performance-switch"
                role="group"
                aria-label="Performance type"
              >
                <button
                  type="button"
                  className={
                    performanceDiscipline === "batting" ? "active" : ""
                  }
                  aria-pressed={performanceDiscipline === "batting"}
                  onClick={() => setPerformanceDiscipline("batting")}
                >
                  Batting
                </button>
                <button
                  type="button"
                  className={
                    performanceDiscipline === "bowling" ? "active" : ""
                  }
                  aria-pressed={performanceDiscipline === "bowling"}
                  onClick={() => setPerformanceDiscipline("bowling")}
                >
                  Bowling
                </button>
              </div>
            </div>
          ) : (
            renderCriteriaMenu()
          )}
          <form className="compact-search" onSubmit={openSearchedPlayer}>
            <label htmlFor="player-search">Open player record</label>
            <div>
              <input
                id="player-search"
                list="player-names"
                value={playerQuery}
                onChange={(event) => setPlayerQuery(event.target.value)}
              placeholder="Search player or cap number"
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
          <button
            className="clear-filters"
            type="button"
            onClick={resetRankingFilters}
          >
            Clear filters
          </button>
        </div>
        {renderPerformanceFilters(
          filters,
          setFilters,
          "ranking",
          activeSection !== "performances",
        )}

        <div className="results-context" aria-live="polite">
          {(filters.startYear !== records.meta.seasonStart ||
            filters.endYear !== records.meta.seasonEnd) && (
            <button
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  startYear: records.meta.seasonStart,
                  endYear: records.meta.seasonEnd,
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
          {activeSection !== "performances" && minimumAppearances > 0 && (
            <button
              type="button"
              onClick={() => setMinimumAppearances(0)}
              aria-label="Remove club appearances filter"
            >
              {minimumAppearances}+ club appearances
              <span aria-hidden="true">×</span>
            </button>
          )}
          <strong>
            {activeSection === "performances"
              ? `${integer.format(
                  Math.min(performanceLimit, performanceRows.length),
                )} performances`
              : `${integer.format(leaderboard.length)} players`}
          </strong>
        </div>

        <div className="archive-stats" aria-label="Filtered archive summary">
          <div>
            <strong>{integer.format(archiveSummary.performances)}</strong>
            <span>Performances</span>
          </div>
          <div>
            <strong>{integer.format(archiveSummary.players)}</strong>
            <span>Players</span>
          </div>
          <div>
            <strong>{integer.format(archiveSummary.matches)}</strong>
            <span>Matches</span>
          </div>
          <div>
            <strong>{integer.format(archiveSummary.seasons)}</strong>
            <span>Seasons</span>
          </div>
        </div>

        <p className="table-scroll-hint">
          <span aria-hidden="true">↔</span> Scroll sideways for every statistic
        </p>
        <div className="stats-table-wrap records-table-wrap">
          {activeSection === "performances" ? (
            <>
              <table className="stats-table performance-table">
              <caption>
                Top individual {performanceDiscipline} performances.
              </caption>
              <thead>
                <tr>
                  <th className="rank-col">Rank</th>
                  <th className="player-col">Player</th>
                  {performanceDiscipline === "batting" ? (
                    <>
                      <th>Score</th>
                      <th>Team</th>
                      <th className="opposition-col">Opposition</th>
                      <th>Date</th>
                      <th>Season</th>
                      <th>Type</th>
                    </>
                  ) : (
                    <>
                      <th>Figures</th>
                      <th>Overs</th>
                      <th>Maidens</th>
                      <th>Team</th>
                      <th className="opposition-col">Opposition</th>
                      <th>Date</th>
                      <th>Season</th>
                      <th>Type</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {performanceDiscipline === "batting"
                  ? (topPerformances as BattingRow[]).map((row, index) => (
                      <tr
                        key={`${row[0]}-${row[5]}-${row[2]}-${row[4]}-${index}`}
                      >
                        <td className="rank-col">
                          {String(index + 1).padStart(2, "0")}
                        </td>
                        <th scope="row" className="player-col">
                          {renderPlayerReference(row[0], "runs")}
                        </th>
                        <td className="performance-score">
                          {integer.format(row[6] as number)}
                          {row[7] ? "*" : ""}
                        </td>
                        <td>{row[2]}</td>
                        <td className="opposition-col">
                          {canonicalOpponent(row[4])}
                        </td>
                        <td>{matchDate(row[5])}</td>
                        <td>{row[1]}</td>
                        <td>{row[3]}</td>
                      </tr>
                    ))
                  : (topPerformances as BowlingRow[]).map((row, index) => (
                      <tr
                        key={`${row[0]}-${row[5]}-${row[2]}-${row[4]}-${index}`}
                      >
                        <td className="rank-col">
                          {String(index + 1).padStart(2, "0")}
                        </td>
                        <th scope="row" className="player-col">
                          {renderPlayerReference(row[0], "bestBowling")}
                        </th>
                        <td className="performance-score">
                          {row[9]}/{row[8]}
                        </td>
                        <td>{overs(row[6])}</td>
                        <td>{integer.format(row[7])}</td>
                        <td>{row[2]}</td>
                        <td className="opposition-col">
                          {canonicalOpponent(row[4])}
                        </td>
                        <td>{matchDate(row[5])}</td>
                        <td>{row[1]}</td>
                        <td>{row[3]}</td>
                      </tr>
                    ))}
              </tbody>
              </table>
              {topPerformances.length === 0 && (
                <p className="empty-state">No matching performances.</p>
              )}
            </>
          ) : (
            <>
              <table className={`stats-table leaderboard-table ${activeSection}-table`}>
            <caption>
              Players ranked by {metrics[metric].label.toLowerCase()}.
            </caption>
            <thead>
              <tr>
                <th className="rank-col">Rank</th>
                <th className="player-col">Player</th>
                {activeSection === "batting" ? (
                  <>
                    {sortableHeader("matches", "Mat")}
                    {sortableHeader("innings", "Inn")}
                    {sortableHeader("runs", "Runs")}
                    {sortableHeader("battingAverage", "Bat avg")}
                    {sortableHeader("battingStrikeRate", "Bat SR")}
                    {sortableHeader("highScore", "HS")}
                    {sortableHeader("notOuts", "NO")}
                    {sortableHeader("fifties", "50s")}
                    {sortableHeader("hundreds", "100s")}
                    {sortableHeader("fours", "4s")}
                    {sortableHeader("sixes", "6s")}
                  </>
                ) : (
                  <>
                    {sortableHeader("matches", "Mat")}
                    {sortableHeader("overs", "Overs")}
                    {sortableHeader("maidens", "Mdns")}
                    {sortableHeader("wickets", "Wkts")}
                    {sortableHeader("fiveWicketHauls", "5WI")}
                    {sortableHeader("bowlingAverage", "Bowl avg")}
                    {sortableHeader("economy", "Econ")}
                    {sortableHeader("bowlingStrikeRate", "Bowl SR")}
                    {sortableHeader("bestBowling", "BB")}
                    {sortableHeader("catches", "Ct")}
                    {sortableHeader("stumpings", "St")}
                    {sortableHeader("runOuts", "RO")}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {displayedLeaderboard.map(({ stats }, index) => (
                <tr key={stats.name}>
                  <td className="rank-col">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <th scope="row" className="player-col">
                    {renderPlayerReference(stats.name)}
                  </th>
                  {activeSection === "batting" ? (
                    <>
                      <td
                        className={metric === "matches" ? "active-sort" : ""}
                      >
                        {integer.format(stats.matches.size)}
                      </td>
                      <td
                        className={metric === "innings" ? "active-sort" : ""}
                      >
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
                      <td
                        className={
                          metric === "battingStrikeRate" ? "active-sort" : ""
                        }
                        title={
                          stats.battingInningsWithBalls > 0
                            ? `Balls faced recorded for ${stats.battingInningsWithBalls} of ${stats.innings} innings`
                            : "No balls-faced data available"
                        }
                      >
                        {metrics.battingStrikeRate.display(stats)}
                      </td>
                      <td
                        className={
                          metric === "highScore" ? "active-sort" : ""
                        }
                      >
                        {metrics.highScore.display(stats)}
                      </td>
                      <td
                        className={metric === "notOuts" ? "active-sort" : ""}
                      >
                        {integer.format(stats.innings - stats.outs)}
                      </td>
                      <td
                        className={metric === "fifties" ? "active-sort" : ""}
                      >
                        {integer.format(stats.fifties)}
                      </td>
                      <td
                        className={metric === "hundreds" ? "active-sort" : ""}
                      >
                        {integer.format(stats.hundreds)}
                      </td>
                      <td className={metric === "fours" ? "active-sort" : ""}>
                        {integer.format(stats.fours)}
                      </td>
                      <td className={metric === "sixes" ? "active-sort" : ""}>
                        {integer.format(stats.sixes)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td
                        className={metric === "matches" ? "active-sort" : ""}
                      >
                        {integer.format(stats.matches.size)}
                      </td>
                      <td className={metric === "overs" ? "active-sort" : ""}>
                        {overs(stats.balls)}
                      </td>
                      <td
                        className={metric === "maidens" ? "active-sort" : ""}
                      >
                        {integer.format(stats.maidens)}
                      </td>
                      <td
                        className={metric === "wickets" ? "active-sort" : ""}
                      >
                        {integer.format(stats.wickets)}
                      </td>
                      <td
                        className={
                          metric === "fiveWicketHauls" ? "active-sort" : ""
                        }
                      >
                        {integer.format(stats.fiveWicketHauls)}
                      </td>
                      <td
                        className={
                          metric === "bowlingAverage" ? "active-sort" : ""
                        }
                      >
                        {metrics.bowlingAverage.display(stats)}
                      </td>
                      <td
                        className={metric === "economy" ? "active-sort" : ""}
                      >
                        {metrics.economy.display(stats)}
                      </td>
                      <td
                        className={
                          metric === "bowlingStrikeRate" ? "active-sort" : ""
                        }
                      >
                        {metrics.bowlingStrikeRate.display(stats)}
                      </td>
                      <td
                        className={
                          metric === "bestBowling" ? "active-sort" : ""
                        }
                      >
                        {metrics.bestBowling.display(stats)}
                      </td>
                      <td
                        className={metric === "catches" ? "active-sort" : ""}
                      >
                        {integer.format(stats.catches)}
                      </td>
                      <td
                        className={metric === "stumpings" ? "active-sort" : ""}
                      >
                        {integer.format(stats.stumpings)}
                      </td>
                      <td
                        className={metric === "runOuts" ? "active-sort" : ""}
                      >
                        {integer.format(stats.runOuts)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              </tbody>
              </table>
              {leaderboard.length === 0 && (
                <p className="empty-state">No matching performances.</p>
              )}
            </>
          )}
        </div>

        {activeSection !== "performances" &&
          leaderboard.length > visibleLimit && (
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

        {activeSection === "performances" &&
          performanceRows.length > performanceLimit && (
            <div className="load-more">
              <span>
                Showing {integer.format(performanceLimit)} of{" "}
                {integer.format(performanceRows.length)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPerformanceLimit((current) =>
                    Math.min(current + 50, performanceRows.length),
                  )
                }
              >
                Show next{" "}
                {Math.min(50, performanceRows.length - performanceLimit)}
              </button>
            </div>
          )}
      </section>

      <footer>
        <div>
          <img src={`${publicBasePath}/escc-logo.png`} alt="" />
          <p>The Inch Park Vault</p>
        </div>
        <p>Edinburgh South Cricket Club Performance Archive – 2004–2026</p>
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
                <button
                  className="clear-filters"
                  type="button"
                  onClick={resetRecordFilters}
                >
                  Clear filters
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
              {(recordFilters.startYear !== records.meta.seasonStart ||
                recordFilters.endYear !== records.meta.seasonEnd) && (
                <button
                  type="button"
                  onClick={() =>
                    setRecordFilters((current) => ({
                      ...current,
                      startYear: records.meta.seasonStart,
                      endYear: records.meta.seasonEnd,
                    }))
                  }
                  aria-label="Remove season filter"
                >
                  {yearLabel(recordFilters.startYear, recordFilters.endYear)}
                  <span aria-hidden="true">×</span>
                </button>
              )}
              {recordFilters.team !== "All teams" && (
                <button
                  type="button"
                  onClick={() =>
                    setRecordFilters((current) => ({
                      ...current,
                      team: "All teams",
                    }))
                  }
                  aria-label={`Remove ${recordFilters.team} filter`}
                >
                  {recordFilters.team}
                  <span aria-hidden="true">×</span>
                </button>
              )}
              {recordFilters.matchType !== "All match types" && (
                <button
                  type="button"
                  onClick={() =>
                    setRecordFilters((current) => ({
                      ...current,
                      matchType: "All match types",
                    }))
                  }
                  aria-label={`Remove ${recordFilters.matchType} filter`}
                >
                  {recordFilters.matchType}
                  <span aria-hidden="true">×</span>
                </button>
              )}
              {recordFilters.opposition && (
                <button
                  type="button"
                  onClick={() =>
                    setRecordFilters((current) => ({
                      ...current,
                      opposition: "",
                    }))
                  }
                  aria-label={`Remove ${recordFilters.opposition} opposition filter`}
                >
                  vs {recordFilters.opposition}
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>

            <div className="player-stat-sections">
              <section className="player-stat-section batting-stats">
                <h3>Batting</h3>
                <div className="player-stat-grid">
                  {profileStatCard(
                    "matches",
                    "Matches",
                    integer.format(selectedStats.matches.size),
                  )}
                  {profileStatCard(
                    "innings",
                    "Innings",
                    integer.format(selectedStats.innings),
                  )}
                  {profileStatCard(
                    "runs",
                    "Runs",
                    integer.format(selectedStats.battingRuns),
                  )}
                  {profileStatCard(
                    "battingAverage",
                    "Batting average",
                    metrics.battingAverage.display(selectedStats),
                  )}
                  {profileStatCard(
                    "highScore",
                    "High score",
                    metrics.highScore.display(selectedStats),
                  )}
                  {profileStatCard(
                    "notOuts",
                    "Not outs",
                    integer.format(selectedStats.innings - selectedStats.outs),
                  )}
                  {profileStatCard(
                    "fifties",
                    "Fifties",
                    integer.format(selectedStats.fifties),
                  )}
                  {profileStatCard(
                    "hundreds",
                    "Hundreds",
                    integer.format(selectedStats.hundreds),
                  )}
                  {profileStatCard(
                    "fours",
                    "Fours",
                    integer.format(selectedBoundaries.fours),
                  )}
                  {profileStatCard(
                    "sixes",
                    "Sixes",
                    integer.format(selectedBoundaries.sixes),
                  )}
                </div>
              </section>

              <div className="secondary-stat-sections">
                <section className="player-stat-section bowling-stats">
                  <h3>Bowling</h3>
                  <div className="player-stat-grid">
                    {profileStatCard(
                      "overs",
                      "Overs",
                      overs(selectedStats.balls),
                    )}
                    {profileStatCard(
                      "maidens",
                      "Maidens",
                      integer.format(selectedStats.maidens),
                    )}
                    {profileStatCard(
                      "wickets",
                      "Wickets",
                      integer.format(selectedStats.wickets),
                    )}
                    {profileStatCard(
                      "fiveWicketHauls",
                      "Five-wicket hauls",
                      integer.format(selectedStats.fiveWicketHauls),
                    )}
                    {profileStatCard(
                      "bowlingAverage",
                      "Bowling average",
                      metrics.bowlingAverage.display(selectedStats),
                    )}
                    {profileStatCard(
                      "economy",
                      "Economy",
                      metrics.economy.display(selectedStats),
                    )}
                    {profileStatCard(
                      "bestBowling",
                      "Best bowling",
                      metrics.bestBowling.display(selectedStats),
                    )}
                  </div>
                </section>

                <section className="player-stat-section fielding-stats">
                  <h3>Fielding</h3>
                  <div className="player-stat-grid">
                    {profileStatCard(
                      "catches",
                      "Catches",
                      integer.format(selectedStats.catches),
                    )}
                    {profileStatCard(
                      "stumpings",
                      "Stumpings",
                      integer.format(selectedStats.stumpings),
                    )}
                    {profileStatCard(
                      "runOuts",
                      "Run outs",
                      integer.format(selectedStats.runOuts),
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-title">
                <div>
                  <span>
                    {profileMetric === "bestBowling"
                      ? "Best-performance wickets by season"
                      : `${metrics[profileMetric].label} by season`}
                  </span>
                  <strong>
                    {profileMetric === "bestBowling"
                      ? `${integer.format(selectedStats.bestWickets)} wickets`
                      : profileMetric === "fours" ||
                          profileMetric === "sixes"
                        ? integer.format(selectedBoundaries[profileMetric])
                      : metrics[profileMetric].display(selectedStats)}
                  </strong>
                </div>
              </div>
              {chart.points.length > 0 ? (
                <svg
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  role="img"
                  aria-label={`${profileMetric === "bestBowling" ? "Best-performance wickets" : metrics[profileMetric].label} by season for ${openPlayer}`}
                >
                  {chart.ticks.map((tick) => (
                    <g key={tick.value}>
                      <line x1="42" x2="818" y1={tick.y} y2={tick.y} />
                      <text x="4" y={tick.y + 4}>
                        {Number.isInteger(tick.value)
                          ? integer.format(tick.value)
                          : tick.value.toFixed(1)}
                      </text>
                    </g>
                  ))}
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
              {(profileMetric === "fours" || profileMetric === "sixes") && (
                <p className="chart-coverage-note">
                  Season chart includes innings with boundary data.
                </p>
              )}
            </div>

            <section className="scorecard-history">
              <div className="scorecard-history-heading">
                <div>
                  <p className="eyebrow">Scorecard archive</p>
                  <h3>Match-by-match history</h3>
                </div>
                {selectedIdentity && (
                  <div className="history-heading-actions">
                    <span>
                      {integer.format(selectedIdentity.appearanceCount)} linked
                      appearances
                    </span>
                    <a
                      href={`${publicBasePath}/players/${selectedIdentity.playerId}/`}
                    >
                      Full profile →
                    </a>
                  </div>
                )}
              </div>

              {!selectedIdentity ? (
                <p className="history-state">
                  No match history is available for this player yet.
                </p>
              ) : !activeScorecardHistory &&
                historyErrorPlayerId !== selectedIdentity.playerId ? (
                <p className="history-state" aria-live="polite">
                  Loading match history…
                </p>
              ) : historyErrorPlayerId === selectedIdentity.playerId ? (
                <p className="history-state">
                  The linked scorecard history could not be loaded.
                </p>
              ) : (
                <>
                  <div className="history-summary">
                    <div>
                      <span>Appearances shown</span>
                      <strong>
                        {integer.format(scorecardHistorySummary.appearances)}
                      </strong>
                    </div>
                    <div>
                      <span>Recorded runs</span>
                      <strong>
                        {integer.format(scorecardHistorySummary.runs)}
                      </strong>
                    </div>
                    <div>
                      <span>Recorded wickets</span>
                      <strong>
                        {integer.format(scorecardHistorySummary.wickets)}
                      </strong>
                    </div>
                  </div>

                  {scorecardHistoryRows.length > 0 && (
                    <div className="scorecard-form">
                      <div className="recent-form">
                        <h4>Recent scorecard form</h4>
                        <div>
                          {sortedScorecardHistoryRows.slice(0, 5).map((appearance) => {
                            const batting = appearance.batting
                              .map((innings) =>
                                innings.runs === null
                                  ? "—"
                                  : `${innings.runs}${innings.notOut ? "*" : ""}`,
                              )
                              .join(", ");
                            const bowling = appearance.bowling
                              .map(
                                (spell) =>
                                  `${spell.wickets ?? 0}/${spell.runs ?? "—"}`,
                              )
                              .join(", ");
                            return (
                              <a
                                key={appearance.fixtureId}
                                href={`${publicBasePath}/matches/${appearance.fixtureId}`}
                                aria-label={`Open scorecard against ${displayOpponent(appearance.opposition)} on ${formatArchiveDate(appearance.date)}`}
                              >
                                <span>
                                  {formatArchiveDate(appearance.date)}
                                </span>
                                <strong>
                                  {displayOpponent(appearance.opposition)}
                                </strong>
                                <small>
                                  Bat {batting || (appearance.didNotBat ? "DNB" : "—")}
                                  {" · "}Bowl {bowling || "—"}
                                </small>
                              </a>
                            );
                          })}
                        </div>
                      </div>

                      <div className="scorecard-season-view">
                        <h4>Recorded performance by season</h4>
                        <div>
                          {scorecardSeasonSummaries.map((summary) => (
                            <div
                              className="scorecard-season-row"
                              key={summary.season}
                            >
                              <strong>{summary.season}</strong>
                              <span>
                                <i
                                  className="runs-bar"
                                  aria-hidden="true"
                                  style={{
                                    width: `${(summary.runs / scorecardSeasonMaxima.runs) * 100}%`,
                                  }}
                                ></i>
                                {integer.format(summary.runs)} runs
                              </span>
                              <span>
                                <i
                                  className="wickets-bar"
                                  aria-hidden="true"
                                  style={{
                                    width: `${(summary.wickets / scorecardSeasonMaxima.wickets) * 100}%`,
                                  }}
                                ></i>
                                {integer.format(summary.wickets)} wickets
                              </span>
                              <small>
                                {integer.format(summary.appearances)} apps
                              </small>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {scorecardHistoryRows.length > 0 ? (
                    <>
                      <label className="performance-sort">
                        <span>Sort performances by</span>
                        <select value={historySort} onChange={(event) => { setHistorySort(event.target.value as typeof historySort); setHistoryLimit(12); }}>
                          <option value="date">Date — newest first</option>
                          <option value="batting">Batting score — highest first</option>
                          <option value="bowling">Bowling figures — best first</option>
                        </select>
                      </label>
                      <div className="history-table-scroll">
                        <table className="history-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Opposition</th>
                              <th>Team</th>
                              <th>Batting</th>
                              <th>Bowling</th>
                              <th aria-label="Open scorecard"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedScorecardHistoryRows
                              .slice(0, historyLimit)
                              .map((appearance) => (
                                <tr key={appearance.fixtureId}>
                                  <td>{formatArchiveDate(appearance.date)}</td>
                                  <th scope="row">
                                    {displayOpponent(appearance.opposition)}
                                  </th>
                                  <td>{appearance.team ?? "—"}</td>
                                  <td>
                                    {appearance.batting.length
                                      ? appearance.batting
                                          .map((innings) =>
                                            innings.runs === null
                                              ? "—"
                                              : `${innings.runs}${innings.notOut ? "*" : ""}`,
                                          )
                                          .join(", ")
                                      : appearance.didNotBat
                                        ? "DNB"
                                        : "—"}
                                  </td>
                                  <td>
                                    {appearance.bowling.length
                                      ? appearance.bowling
                                          .map(
                                            (spell) =>
                                              `${spell.wickets ?? 0}/${spell.runs ?? "—"}${spell.overs ? ` (${spell.overs})` : ""}`,
                                          )
                                          .join(", ")
                                      : "—"}
                                  </td>
                                  <td>
                                    <a
                                      href={`${publicBasePath}/matches/${appearance.fixtureId}`}
                                    >
                                      Scorecard
                                    </a>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {historyLimit < scorecardHistoryRows.length && (
                        <button
                          className="history-more"
                          type="button"
                          onClick={() =>
                            setHistoryLimit((current) => current + 12)
                          }
                        >
                          Show 12 more matches
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="history-state">
                      No linked scorecards match the current profile filters.
                    </p>
                  )}

                  <p className="history-note">
                    Older match histories may have gaps.
                  </p>
                </>
              )}
            </section>
          </section>
        </div>
      )}
    </main>
  );
}
