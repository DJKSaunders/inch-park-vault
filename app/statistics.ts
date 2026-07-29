export type BattingRow = [
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

export type BowlingRow = [
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

export type RecordsData = {
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

export type PlayerDirectoryEntry = {
  playerId: string;
  name: string;
  aliases: string[];
  scorecardPlayerId: string | null;
  scorecardPath: string | null;
};

export type PlayerDirectory = {
  schemaVersion: string;
  playerCount: number;
  players: PlayerDirectoryEntry[];
};

export type PlayerStats = {
  name: string;
  matches: Set<string>;
  innings: number;
  runs: number;
  outs: number;
  highScore: number;
  highScoreNotOut: boolean;
  fifties: number;
  hundreds: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  balls: number;
  maidens: number;
  bowlingRuns: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
  fiveWicketHauls: number;
};

export type ProfileMetric =
  | "matches"
  | "innings"
  | "runs"
  | "battingAverage"
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
  | "bestBowling"
  | "catches"
  | "stumpings"
  | "runOuts";

export type ScorecardPlayerHistory = {
  playerId: string;
  name: string;
  appearances: {
    fixtureId: string;
    date: string;
    season: number;
    team: string | null;
    opposition: string | null;
    competition: string | null;
    outcome: string;
    didNotBat: boolean;
  }[];
  battingInnings: {
    fixtureId: string;
    season: number;
    runs: number | null;
    notOut: boolean;
    fours: number | null;
    sixes: number | null;
  }[];
  bowlingSpells: {
    fixtureId: string;
    season: number;
    overs: string | null;
    runs: number | null;
    wickets: number | null;
  }[];
};

const integer = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function playerNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function matchKey(row: BattingRow | BowlingRow) {
  return `${row[5]}|${row[2]}|${row[4]}`;
}

export function emptyPlayerStats(name: string): PlayerStats {
  return {
    name,
    matches: new Set<string>(),
    innings: 0,
    runs: 0,
    outs: 0,
    highScore: 0,
    highScoreNotOut: false,
    fifties: 0,
    hundreds: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    balls: 0,
    maidens: 0,
    bowlingRuns: 0,
    wickets: 0,
    bestWickets: 0,
    bestRuns: Number.POSITIVE_INFINITY,
    fiveWicketHauls: 0,
  };
}

export function addBatting(stats: PlayerStats, row: BattingRow) {
  const runs = typeof row[6] === "number" ? row[6] : 0;
  if (!row[8]) {
    stats.innings += 1;
    stats.runs += runs;
    if (
      runs > stats.highScore ||
      (runs === stats.highScore && row[7] && !stats.highScoreNotOut)
    ) {
      stats.highScore = runs;
      stats.highScoreNotOut = row[7];
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

export function addBowling(stats: PlayerStats, row: BowlingRow) {
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

export function rowsForAliases(records: RecordsData, aliases: string[]) {
  const names = new Set(aliases.map(playerNameKey));
  return {
    batting: records.batting.filter((row) => names.has(playerNameKey(row[0]))),
    bowling: records.bowling.filter((row) => names.has(playerNameKey(row[0]))),
  };
}

export function aggregatePlayer(
  name: string,
  batting: BattingRow[],
  bowling: BowlingRow[],
) {
  const stats = emptyPlayerStats(name);
  batting.forEach((row) => addBatting(stats, row));
  bowling.forEach((row) => addBowling(stats, row));
  return stats;
}

export function aggregatePlayerBySeason(
  name: string,
  batting: BattingRow[],
  bowling: BowlingRow[],
) {
  const seasons = new Map<number, PlayerStats>();
  const get = (season: number) => {
    const current = seasons.get(season) ?? emptyPlayerStats(name);
    seasons.set(season, current);
    return current;
  };
  batting.forEach((row) => addBatting(get(row[1]), row));
  bowling.forEach((row) => addBowling(get(row[1]), row));
  return seasons;
}

export function oversFromBalls(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function battingAverage(stats: PlayerStats) {
  return stats.outs > 0 ? stats.runs / stats.outs : null;
}

export function bowlingAverage(stats: PlayerStats) {
  return stats.wickets > 0 ? stats.bowlingRuns / stats.wickets : null;
}

export function economy(stats: PlayerStats) {
  return stats.balls > 0 ? stats.bowlingRuns / (stats.balls / 6) : null;
}

export const profileMetricLabels: Record<ProfileMetric, string> = {
  matches: "Appearances",
  innings: "Batting innings",
  runs: "Runs",
  battingAverage: "Batting average",
  highScore: "Highest score",
  notOuts: "Not outs",
  fifties: "Fifties",
  hundreds: "Hundreds",
  fours: "Fours",
  sixes: "Sixes",
  overs: "Overs",
  maidens: "Maidens",
  wickets: "Wickets",
  fiveWicketHauls: "Five-wicket hauls",
  bowlingAverage: "Bowling average",
  economy: "Economy rate",
  bestBowling: "Best-bowling wickets",
  catches: "Catches",
  stumpings: "Stumpings",
  runOuts: "Run outs",
};

export function metricValue(metric: ProfileMetric, stats: PlayerStats) {
  switch (metric) {
    case "matches":
      return stats.matches.size;
    case "innings":
      return stats.innings;
    case "runs":
      return stats.runs;
    case "battingAverage":
      return battingAverage(stats);
    case "highScore":
      return stats.highScore;
    case "notOuts":
      return stats.innings - stats.outs;
    case "fifties":
      return stats.fifties;
    case "hundreds":
      return stats.hundreds;
    case "overs":
      return stats.balls / 6;
    case "maidens":
      return stats.maidens;
    case "wickets":
      return stats.wickets;
    case "fiveWicketHauls":
      return stats.fiveWicketHauls;
    case "bowlingAverage":
      return bowlingAverage(stats);
    case "economy":
      return economy(stats);
    case "bestBowling":
      return stats.bestWickets > 0 ? stats.bestWickets : null;
    case "catches":
      return stats.catches;
    case "stumpings":
      return stats.stumpings;
    case "runOuts":
      return stats.runOuts;
    case "fours":
    case "sixes":
      return null;
  }
}

export function metricDisplay(metric: ProfileMetric, stats: PlayerStats) {
  const value = metricValue(metric, stats);
  if (value === null) return "—";
  if (
    metric === "battingAverage" ||
    metric === "bowlingAverage" ||
    metric === "economy"
  ) {
    return decimal.format(value);
  }
  if (metric === "overs") return oversFromBalls(stats.balls);
  if (metric === "highScore") {
    return `${integer.format(stats.highScore)}${stats.highScoreNotOut ? "*" : ""}`;
  }
  if (metric === "bestBowling") {
    return stats.bestWickets > 0
      ? `${stats.bestWickets}/${stats.bestRuns}`
      : "—";
  }
  return integer.format(value);
}

export function boundaryCareerTotals(records: RecordsData, aliases: string[]) {
  const names = new Set(aliases.map(playerNameKey));
  return records.boundaries.reduce(
    (totals, [name, fours, sixes]) => {
      if (names.has(playerNameKey(name))) {
        totals.fours += fours;
        totals.sixes += sixes;
      }
      return totals;
    },
    { fours: 0, sixes: 0 },
  );
}

export function boundarySeasons(history: ScorecardPlayerHistory | null) {
  const seasons = new Map<
    number,
    {
      fours: number;
      sixes: number;
      foursKnown: number;
      sixesKnown: number;
      innings: number;
    }
  >();
  for (const innings of history?.battingInnings ?? []) {
    const summary = seasons.get(innings.season) ?? {
      fours: 0,
      sixes: 0,
      foursKnown: 0,
      sixesKnown: 0,
      innings: 0,
    };
    summary.innings += 1;
    if (innings.fours !== null) {
      summary.fours += innings.fours;
      summary.foursKnown += 1;
    }
    if (innings.sixes !== null) {
      summary.sixes += innings.sixes;
      summary.sixesKnown += 1;
    }
    seasons.set(innings.season, summary);
  }
  return seasons;
}
