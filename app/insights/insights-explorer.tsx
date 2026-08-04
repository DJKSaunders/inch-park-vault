"use client";

import { useEffect, useMemo, useState } from "react";
import { DismissalStackedBars } from "../components/dismissal-stacked-bars";
import {
  ComparisonSelect,
  ComparisonTeamSelect,
} from "../components/comparison-select";
import { SeasonChart } from "../components/season-chart";
import { SiteHeader } from "../site-header";
import {
  aggregatePlayer,
  battingAverage,
  bowlingAverage,
  bowlingStrikeRate,
  economy,
  rowsForAliases,
  type PlayerDirectory,
  type PlayerDirectoryEntry,
  type RecordsData,
  type DismissalType,
} from "../statistics";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type MatchIndex = {
  meta: {
    matchCount: number;
    seasonStart: number;
    seasonEnd: number;
    teams: string[];
    competitions: string[];
  };
  matches: {
    fixtureId: string;
    date: string;
    season: number;
    esccTeam: string | null;
    opposition: string | null;
    competition: string | null;
    outcome: string;
    result: string;
  }[];
};

type TrendMetric = "runs" | "wickets" | "fixtures";
type ClubTrendMetric =
  | "firstInningsScore"
  | "oppositionFirstInningsScore"
  | "winBattingFirst"
  | "winChasing"
  | "chaseScore"
  | "successfulChase"
  | "wicketsLost"
  | "wicketsTaken"
  | "battingRunsPerWicket"
  | "bowlingRunsPerWicket";

type ClubInsights = {
  matches: {
    fixtureId: string;
    season: number;
    team: string | null;
    competition: string | null;
    outcome: string;
    firstBattingRole: "escc" | "opponent" | null;
  }[];
  innings: {
    fixtureId: string;
    season: number;
    team: string | null;
    competition: string | null;
    outcome: string;
    inningsNumber: number;
    battingRole: "escc" | "opponent";
    runs: number | null;
    wickets: number | null;
    overs: string | null;
  }[];
  dismissals: {
    season: number;
    team: string | null;
    competition: string | null;
    type: DismissalType;
    count: number;
  }[];
};

type ComparisonMetric = {
  label: string;
  values: (number | null)[];
  format: (value: number | null) => string;
  lowerIsBetter?: boolean;
  coverage?: string[];
};

type ScorecardBattingInnings = {
  playerId: string;
  season: number;
  team: string | null;
  competition: string | null;
  opposition: string | null;
  runs: number | null;
  balls: number | null;
};

const clubTrendLabels: Record<ClubTrendMetric, string> = {
  firstInningsScore: "Average score batting first",
  oppositionFirstInningsScore: "Average opposition first-innings score",
  winBattingFirst: "Win rate batting first",
  winChasing: "Win rate chasing",
  chaseScore: "Average chase score",
  successfulChase: "Successful chase rate",
  wicketsLost: "Average wickets lost",
  wicketsTaken: "Average wickets taken",
  battingRunsPerWicket: "Batting runs per wicket",
  bowlingRunsPerWicket: "Runs conceded per wicket",
};

const clubTrendDirection: Record<
  ClubTrendMetric,
  "higher" | "lower" | "neutral"
> = {
  firstInningsScore: "higher",
  oppositionFirstInningsScore: "lower",
  winBattingFirst: "higher",
  winChasing: "higher",
  chaseScore: "higher",
  successfulChase: "higher",
  wicketsLost: "lower",
  wicketsTaken: "higher",
  battingRunsPerWicket: "higher",
  bowlingRunsPerWicket: "lower",
};

function compactOpponent(value: string | null) {
  return (value ?? "Unknown opposition")
    .replace(/\s+/g, " ")
    .replace(/\bC\.?\s*C\.?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function comparisonValue(
  entry: PlayerDirectoryEntry,
  records: RecordsData,
) {
  const rows = rowsForAliases(records, entry.aliases);
  return aggregatePlayer(entry.name, rows.batting, rows.bowling);
}

export function InsightsExplorer() {
  const [records, setRecords] = useState<RecordsData | null>(null);
  const [directory, setDirectory] = useState<PlayerDirectory | null>(null);
  const [matches, setMatches] = useState<MatchIndex | null>(null);
  const [clubInsights, setClubInsights] = useState<ClubInsights | null>(null);
  const [team, setTeam] = useState("All teams");
  const [competition, setCompetition] = useState("All competitions");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("runs");
  const [clubTrendMetric, setClubTrendMetric] =
    useState<ClubTrendMetric>("firstInningsScore");
  const [leftPlayer, setLeftPlayer] = useState("");
  const [rightPlayer, setRightPlayer] = useState("");
  const [thirdPlayer, setThirdPlayer] = useState("");
  const [comparisonStartYear, setComparisonStartYear] = useState(2004);
  const [comparisonEndYear, setComparisonEndYear] = useState(2026);
  const [comparisonTeams, setComparisonTeams] = useState<string[]>([]);
  const [comparisonMatchType, setComparisonMatchType] = useState("");
  const [comparisonOpponent, setComparisonOpponent] = useState("");
  const [scorecardBatting, setScorecardBatting] = useState<
    ScorecardBattingInnings[] | null
  >(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${publicBasePath}/data/records.json`).then((response) => {
        if (!response.ok) throw new Error("Records unavailable");
        return response.json() as Promise<RecordsData>;
      }),
      fetch(`${publicBasePath}/data/scorecards/player-directory.json`).then(
        (response) => {
          if (!response.ok) throw new Error("Directory unavailable");
          return response.json() as Promise<PlayerDirectory>;
        },
      ),
      fetch(`${publicBasePath}/data/scorecards/index.json`).then((response) => {
        if (!response.ok) throw new Error("Matches unavailable");
        return response.json() as Promise<MatchIndex>;
      }),
      fetch(`${publicBasePath}/data/scorecards/club-insights.json`).then(
        (response) => {
          if (!response.ok) throw new Error("Club insights unavailable");
          return response.json() as Promise<ClubInsights>;
        },
      ),
      fetch(`${publicBasePath}/data/scorecards/batting-innings.json`).then(
        (response) => {
          if (!response.ok) throw new Error("Batting innings unavailable");
          return response.json() as Promise<ScorecardBattingInnings[]>;
        },
      ),
    ])
      .then(
        ([
          nextRecords,
          nextDirectory,
          nextMatches,
          nextClubInsights,
          nextScorecardBatting,
        ]) => {
        setRecords(nextRecords);
        setDirectory(nextDirectory);
        setMatches(nextMatches);
        setClubInsights(nextClubInsights);
        setScorecardBatting(nextScorecardBatting);
        setComparisonStartYear(nextRecords.meta.seasonStart);
        setComparisonEndYear(nextRecords.meta.seasonEnd);
        const requested = new URLSearchParams(window.location.search).get("player");
        const initialLeft =
          nextDirectory.players.find((player) => player.playerId === requested) ??
          nextDirectory.players.find((player) => player.name === "Nabkishore Pani") ??
          nextDirectory.players[0];
        const initialRight =
          nextDirectory.players.find((player) => player.name === "George O’Neill") ??
          nextDirectory.players.find(
            (player) => player.playerId !== initialLeft.playerId,
          );
        setLeftPlayer(initialLeft?.playerId ?? "");
        setRightPlayer(initialRight?.playerId ?? "");
        },
      )
      .catch(() => setFailed(true));
  }, []);

  const filteredRows = useMemo(() => {
    if (!records) return { batting: [], bowling: [] };
    const passes = (row: RecordsData["batting"][number] | RecordsData["bowling"][number]) =>
      (team === "All teams" || row[2] === team) &&
      (competition === "All competitions" || row[3] === competition);
    return {
      batting: records.batting.filter(passes),
      bowling: records.bowling.filter(passes),
    };
  }, [competition, records, team]);

  const seasonPoints = useMemo(() => {
    if (!matches) return [];
    const seasons = new Map<number, { value: number; samples: number }>();
    const add = (season: number, value: number) => {
      const current = seasons.get(season) ?? { value: 0, samples: 0 };
      current.value += value;
      current.samples += 1;
      seasons.set(season, current);
    };
    if (trendMetric === "runs") {
      for (const row of filteredRows.batting) {
        if (!row[8] && typeof row[6] === "number") {
          add(row[1], row[6]);
        }
      }
    } else if (trendMetric === "wickets") {
      for (const row of filteredRows.bowling) {
        add(row[1], row[9]);
      }
    } else {
      for (const match of matches.matches) {
        if (
          (team === "All teams" || match.esccTeam === team) &&
          (competition === "All competitions" ||
            match.competition === competition)
        ) {
          add(match.season, 1);
        }
      }
    }
    return [...seasons]
      .map(([season, summary]) => ({
        season,
        value: summary.value,
        display: integer.format(summary.value),
        valueLabel: integer.format(summary.value),
        details: [
          `${integer.format(summary.samples)} ${trendMetric === "runs" ? "recorded innings" : trendMetric === "wickets" ? "bowling spells" : "fixture records"}`,
        ],
      }))
      .sort((left, right) => left.season - right.season);
  }, [competition, filteredRows, matches, team, trendMetric]);

  const resultSummary = useMemo(() => {
    if (!matches) return [];
    const outcomes = new Map<string, number>();
    for (const match of matches.matches) {
      if (
        (team === "All teams" || match.esccTeam === team) &&
        (competition === "All competitions" ||
          match.competition === competition)
      ) {
        outcomes.set(match.outcome, (outcomes.get(match.outcome) ?? 0) + 1);
      }
    }
    const total = [...outcomes.values()].reduce((sum, value) => sum + value, 0);
    return [...outcomes]
      .map(([outcome, count]) => ({
        outcome,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((left, right) => right.count - left.count);
  }, [competition, matches, team]);

  const opponents = useMemo(() => {
    if (!matches) return [];
    const summaries = new Map<
      string,
      { name: string; played: number; won: number; lost: number; tied: number }
    >();
    for (const match of matches.matches) {
      if (
        (team !== "All teams" && match.esccTeam !== team) ||
        (competition !== "All competitions" &&
          match.competition !== competition)
      ) {
        continue;
      }
      const name = compactOpponent(match.opposition);
      const key = name.toLocaleLowerCase();
      const summary = summaries.get(key) ?? {
        name,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
      };
      summary.played += 1;
      if (match.outcome === "win" || match.outcome === "concession") summary.won += 1;
      if (match.outcome === "loss") summary.lost += 1;
      if (match.outcome === "tie") summary.tied += 1;
      summaries.set(key, summary);
    }
    return [...summaries.values()]
      .sort(
        (left, right) =>
          right.played - left.played || left.name.localeCompare(right.name),
      )
      .slice(0, 12);
  }, [competition, matches, team]);

  const filteredClubMatches = useMemo(
    () =>
      (clubInsights?.matches ?? []).filter(
        (match) =>
          (team === "All teams" || match.team === team) &&
          (competition === "All competitions" ||
            match.competition === competition),
      ),
    [clubInsights, competition, team],
  );

  const filteredClubInnings = useMemo(
    () =>
      (clubInsights?.innings ?? []).filter(
        (innings) =>
          (team === "All teams" || innings.team === team) &&
          (competition === "All competitions" ||
            innings.competition === competition),
      ),
    [clubInsights, competition, team],
  );

  const clubTrendPoints = useMemo(() => {
    const validOutcomes = new Set(["win", "loss", "tie", "draw"]);
    const values = new Map<
      number,
      { numerator: number; denominator: number; samples: number }
    >();
    const add = (
      season: number,
      numerator: number,
      denominator = 1,
      samples = 1,
    ) => {
      const current = values.get(season) ?? {
        numerator: 0,
        denominator: 0,
        samples: 0,
      };
      current.numerator += numerator;
      current.denominator += denominator;
      current.samples += samples;
      values.set(season, current);
    };

    if (
      clubTrendMetric === "winBattingFirst" ||
      clubTrendMetric === "winChasing"
    ) {
      const expectedRole =
        clubTrendMetric === "winBattingFirst" ? "escc" : "opponent";
      for (const match of filteredClubMatches) {
        if (
          match.firstBattingRole !== expectedRole ||
          !validOutcomes.has(match.outcome)
        ) {
          continue;
        }
        add(match.season, match.outcome === "win" ? 100 : 0);
      }
    } else if (clubTrendMetric === "successfulChase") {
      const chaseFixtures = new Set(
        filteredClubInnings
          .filter(
            (innings) =>
              innings.inningsNumber === 2 &&
              innings.battingRole === "escc" &&
              validOutcomes.has(innings.outcome),
          )
          .map((innings) => innings.fixtureId),
      );
      for (const match of filteredClubMatches) {
        if (!chaseFixtures.has(match.fixtureId)) continue;
        add(match.season, match.outcome === "win" ? 100 : 0);
      }
    } else {
      for (const innings of filteredClubInnings) {
        if (
          !validOutcomes.has(innings.outcome) ||
          innings.runs === null ||
          innings.wickets === null
        ) {
          continue;
        }
        if (
          clubTrendMetric === "firstInningsScore" &&
          innings.inningsNumber === 1 &&
          innings.battingRole === "escc"
        ) {
          add(innings.season, innings.runs);
        } else if (
          clubTrendMetric === "oppositionFirstInningsScore" &&
          innings.inningsNumber === 1 &&
          innings.battingRole === "opponent"
        ) {
          add(innings.season, innings.runs);
        } else if (
          clubTrendMetric === "chaseScore" &&
          innings.inningsNumber === 2 &&
          innings.battingRole === "escc"
        ) {
          add(innings.season, innings.runs);
        } else if (
          clubTrendMetric === "wicketsLost" &&
          innings.battingRole === "escc"
        ) {
          add(innings.season, innings.wickets);
        } else if (
          clubTrendMetric === "wicketsTaken" &&
          innings.battingRole === "opponent"
        ) {
          add(innings.season, innings.wickets);
        } else if (
          clubTrendMetric === "battingRunsPerWicket" &&
          innings.battingRole === "escc" &&
          innings.wickets > 0
        ) {
          add(innings.season, innings.runs, innings.wickets);
        } else if (
          clubTrendMetric === "bowlingRunsPerWicket" &&
          innings.battingRole === "opponent" &&
          innings.wickets > 0
        ) {
          add(innings.season, innings.runs, innings.wickets);
        }
      }
    }
    return [...values]
      .filter(([, summary]) => summary.denominator > 0)
      .map(([season, summary]) => {
        const value = summary.numerator / summary.denominator;
        const percentage =
          clubTrendMetric === "winBattingFirst" ||
          clubTrendMetric === "winChasing" ||
          clubTrendMetric === "successfulChase";
        return {
          season,
          value,
          display: `${decimal.format(value)}${percentage ? "%" : ""} · ${integer.format(summary.samples)} ${summary.samples === 1 ? "sample" : "samples"}`,
          valueLabel: `${value.toFixed(1)}${percentage ? "%" : ""}`,
          details:
            clubTrendMetric === "winBattingFirst" ||
            clubTrendMetric === "winChasing" ||
            clubTrendMetric === "successfulChase"
              ? [
                  `${integer.format(summary.numerator / 100)} successful · ${integer.format(summary.samples)} qualifying matches`,
                ]
              : clubTrendMetric === "battingRunsPerWicket" ||
                  clubTrendMetric === "bowlingRunsPerWicket"
                ? [
                    `${integer.format(summary.numerator)} runs · ${integer.format(summary.denominator)} wickets`,
                    `${integer.format(summary.samples)} qualifying innings`,
                  ]
                : [
                    `${integer.format(summary.numerator)} total · ${integer.format(summary.samples)} qualifying innings`,
                  ],
        };
      })
      .sort((left, right) => left.season - right.season);
  }, [
    clubTrendMetric,
    filteredClubInnings,
    filteredClubMatches,
  ]);

  const dismissalSeasons = useMemo(() => {
    const seasons = new Map<
      number,
      Partial<Record<DismissalType, number>>
    >();
    for (const row of clubInsights?.dismissals ?? []) {
      if (
        (team !== "All teams" && row.team !== team) ||
        (competition !== "All competitions" &&
          row.competition !== competition)
      ) {
        continue;
      }
      const counts = seasons.get(row.season) ?? {};
      counts[row.type] = (counts[row.type] ?? 0) + row.count;
      seasons.set(row.season, counts);
    }
    return [...seasons]
      .map(([season, counts]) => ({ season, counts }))
      .sort((left, right) => left.season - right.season);
  }, [clubInsights, competition, team]);

  const selectedPlayers = useMemo(() => {
    if (!directory || !records) return null;
    const playerIds = [leftPlayer, rightPlayer, thirdPlayer].filter(Boolean);
    const players = playerIds
      .map((playerId) =>
        directory.players.find((player) => player.playerId === playerId),
      )
      .filter((player): player is PlayerDirectoryEntry => Boolean(player));
    if (players.length < 2) return null;
    const passes = (
      row: RecordsData["batting"][number] | RecordsData["bowling"][number],
    ) =>
      row[1] >= comparisonStartYear &&
      row[1] <= comparisonEndYear &&
      (!comparisonTeams.length || comparisonTeams.includes(row[2])) &&
      (!comparisonMatchType || row[3] === comparisonMatchType) &&
      (!comparisonOpponent || row[4] === comparisonOpponent);
    const filteredRecords: RecordsData = {
      ...records,
      batting: records.batting.filter(passes),
      bowling: records.bowling.filter(passes),
    };
    return players.map((entry) => ({
      entry,
      stats: comparisonValue(entry, filteredRecords),
    }));
  }, [
    comparisonEndYear,
    comparisonMatchType,
    comparisonOpponent,
    comparisonStartYear,
    comparisonTeams,
    directory,
    leftPlayer,
    records,
    rightPlayer,
    thirdPlayer,
  ]);

  if (failed) {
    return (
      <>
        <SiteHeader active="insights" />
        <main className="status-screen">
          <h1>Insights are temporarily unavailable.</h1>
        </main>
      </>
    );
  }

  if (!records || !directory || !matches || !clubInsights || !scorecardBatting) {
    return (
      <>
        <SiteHeader active="insights" />
        <main className="status-screen" aria-live="polite">
          <div className="loading-line" />
          <p>Building the insight dashboards…</p>
        </main>
      </>
    );
  }

  const comparisonSeasons = Array.from(
    { length: records.meta.seasonEnd - records.meta.seasonStart + 1 },
    (_, index) => records.meta.seasonStart + index,
  );
  const playerOptions = directory.players.map((player) => ({
    id: player.playerId,
    label: player.name,
  }));
  const battingStrikeRateFor = (entry: PlayerDirectoryEntry) => {
    const innings = scorecardBatting.filter(
      (row) =>
        row.playerId === entry.playerId &&
        row.season >= comparisonStartYear &&
        row.season <= comparisonEndYear &&
        (!comparisonTeams.length ||
          (row.team !== null && comparisonTeams.includes(row.team))) &&
        (!comparisonMatchType || row.competition === comparisonMatchType) &&
        (!comparisonOpponent || row.opposition === comparisonOpponent) &&
        row.balls !== null &&
        row.balls > 0,
    );
    const balls = innings.reduce((sum, row) => sum + (row.balls ?? 0), 0);
    const runs = innings.reduce((sum, row) => sum + (row.runs ?? 0), 0);
    return {
      value: balls > 0 ? (runs / balls) * 100 : null,
      innings: innings.length,
    };
  };
  const comparisonStrikeRates = selectedPlayers?.map((player) =>
    battingStrikeRateFor(player.entry),
  );

  const comparisonMetrics: ComparisonMetric[] = selectedPlayers
    ? [
        {
          label: "Appearances",
          values: selectedPlayers.map((player) => player.stats.matches.size),
          format: (value: number | null) =>
            value === null ? "—" : integer.format(value),
        },
        {
          label: "Runs",
          values: selectedPlayers.map((player) =>
            player.stats.matches.size ? player.stats.runs : null,
          ),
          format: (value: number | null) =>
            value === null ? "—" : integer.format(value),
        },
        {
          label: "Batting average",
          values: selectedPlayers.map((player) => battingAverage(player.stats)),
          format: (value: number | null) =>
            value === null ? "—" : decimal.format(value),
        },
        {
          label: "Batting strike rate",
          values: comparisonStrikeRates?.map((summary) => summary.value) ?? [],
          format: (value: number | null) =>
            value === null ? "—" : decimal.format(value),
          coverage: selectedPlayers.map(
            (player, index) => {
              const known = comparisonStrikeRates?.[index].innings ?? 0;
              const total = player.stats.innings;
              const percentage = total > 0 ? Math.round((known / total) * 100) : 0;
              return `${known}/${total} innings (${percentage}%)`;
            },
          ),
        },
        {
          label: "Highest score",
          values: selectedPlayers.map((player) =>
            player.stats.innings > 0 ? player.stats.highScore : null,
          ),
          format: (value: number | null) =>
            value === null ? "—" : integer.format(value),
        },
        {
          label: "Wickets",
          values: selectedPlayers.map((player) =>
            player.stats.matches.size ? player.stats.wickets : null,
          ),
          format: (value: number | null) =>
            value === null ? "—" : integer.format(value),
        },
        {
          label: "Bowling average",
          values: selectedPlayers.map((player) => bowlingAverage(player.stats)),
          format: (value: number | null) =>
            value === null ? "—" : decimal.format(value),
          lowerIsBetter: true,
        },
        {
          label: "Economy",
          values: selectedPlayers.map((player) => economy(player.stats)),
          format: (value: number | null) =>
            value === null ? "—" : decimal.format(value),
          lowerIsBetter: true,
        },
        {
          label: "Bowling strike rate",
          values: selectedPlayers.map((player) =>
            bowlingStrikeRate(player.stats),
          ),
          format: (value: number | null) =>
            value === null ? "—" : decimal.format(value),
          lowerIsBetter: true,
        },
        {
          label: "Catches",
          values: selectedPlayers.map((player) =>
            player.stats.matches.size ? player.stats.catches : null,
          ),
          format: (value: number | null) =>
            value === null ? "—" : integer.format(value),
        },
      ]
    : [];

  function comparisonOutcomes(item: ComparisonMetric) {
    const valid = item.values
      .map((value, index) => ({ value, index }))
      .filter((entry): entry is { value: number; index: number } =>
        entry.value !== null,
      );
    const outcomes = item.values.map(() => "none" as const) as (
      | "better"
      | "weaker"
      | "middle"
      | "level"
      | "none"
    )[];
    if (valid.length < 2) return outcomes;
    const values = valid.map((entry) => entry.value);
    const best = item.lowerIsBetter ? Math.min(...values) : Math.max(...values);
    const weakest = item.lowerIsBetter ? Math.max(...values) : Math.min(...values);
    if (best === weakest) {
      valid.forEach(({ index }) => (outcomes[index] = "level"));
      return outcomes;
    }
    valid.forEach(({ value, index }) => {
      if (value === best) outcomes[index] = "better";
      else if (value === weakest) outcomes[index] = "weaker";
      else outcomes[index] = "middle";
    });
    return outcomes;
  }

  const filterContext = `${team} · ${competition}`;

  return (
    <>
      <SiteHeader active="insights" />
      <main className="portal-page insights-page">
        <header className="portal-page-heading">
          <p className="eyebrow">Visual analysis</p>
          <h1>Insights</h1>
          <p>
            Follow the archive through time, inspect team outcomes and compare
            careers on the same scale.
          </p>
        </header>

        <nav className="insights-subnav" aria-label="Insights sections">
          <a href="#overview">Overview</a>
          <a href="#club-trends">Club trends</a>
          <a href="#dismissals">Dismissals</a>
          <a href="#compare">Player comparison</a>
        </nav>

        <section className="insight-filter-bar" id="overview">
          <label>
            <span>Team</span>
            <select value={team} onChange={(event) => setTeam(event.target.value)}>
              <option>All teams</option>
              {matches.meta.teams.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Competition</span>
            <select
              value={competition}
              onChange={(event) => setCompetition(event.target.value)}
            >
              <option>All competitions</option>
              {matches.meta.competitions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="insight-panel season-insight">
          <header>
            <div>
              <p className="eyebrow">Archive over time</p>
              <h2>Season trend</h2>
            </div>
            <div className="metric-pills" aria-label="Trend metric">
              {(["runs", "wickets", "fixtures"] as TrendMetric[]).map((key) => (
                <button
                  type="button"
                  className={trendMetric === key ? "active" : undefined}
                  onClick={() => setTrendMetric(key)}
                  key={key}
                >
                  {key}
                </button>
              ))}
            </div>
          </header>
          <SeasonChart
            label={trendMetric}
            points={seasonPoints}
            context={filterContext}
            note={
              trendMetric === "fixtures"
                ? "Intra-club games are counted separately."
                : undefined
            }
          />
        </section>

        <section className="insight-panel club-trend-panel" id="club-trends">
          <header>
            <div>
              <p className="eyebrow">Club comparisons</p>
              <h2>{clubTrendLabels[clubTrendMetric]}</h2>
            </div>
            <label>
              <span>Trend</span>
              <select
                value={clubTrendMetric}
                onChange={(event) =>
                  setClubTrendMetric(event.target.value as ClubTrendMetric)
                }
              >
                {(Object.keys(clubTrendLabels) as ClubTrendMetric[]).map(
                  (key) => (
                    <option value={key} key={key}>
                      {clubTrendLabels[key]}
                    </option>
                  ),
                )}
              </select>
            </label>
          </header>
          <SeasonChart
            label={clubTrendLabels[clubTrendMetric]}
            points={clubTrendPoints}
            context={filterContext}
            direction={clubTrendDirection[clubTrendMetric]}
            note="Excludes concessions, abandoned matches and innings that were not played."
          />
        </section>

        <section className="insight-panel dismissal-trend-panel" id="dismissals">
          <header>
            <div>
              <p className="eyebrow">Batting dismissals</p>
              <h2>How South wickets fell by season</h2>
            </div>
            <span>Each season totals 100%</span>
          </header>
          <DismissalStackedBars
            seasons={dismissalSeasons}
            context={filterContext}
          />
          <p className="chart-note">
            Not-outs and did-not-bat entries are excluded.
          </p>
        </section>

        <div className="insight-two-column">
          <section className="insight-panel result-insight">
            <header>
              <div>
                <p className="eyebrow">Fixture outcomes</p>
                <h2>Results</h2>
              </div>
            </header>
            <div className="result-bars">
              {resultSummary.map((result) => (
                <div key={result.outcome}>
                  <span>{result.outcome}</span>
                  <div>
                    <i style={{ width: `${result.percent}%` }} />
                  </div>
                  <strong>{integer.format(result.count)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="insight-panel opponent-insight">
            <header>
              <div>
                <p className="eyebrow">Most frequent</p>
                <h2>Opposition</h2>
              </div>
            </header>
            <div className="opponent-table" role="table">
              <div role="row">
                <span role="columnheader">Opponent</span>
                <span role="columnheader">P</span>
                <span role="columnheader">W</span>
                <span role="columnheader">L</span>
                <span role="columnheader">T</span>
              </div>
              {opponents.map((opponent) => (
                <div role="row" key={opponent.name}>
                  <strong role="cell">{opponent.name}</strong>
                  <span role="cell">{opponent.played}</span>
                  <span role="cell">{opponent.won}</span>
                  <span role="cell">{opponent.lost}</span>
                  <span role="cell">{opponent.tied}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="insight-panel comparison-panel" id="compare">
          <header>
            <div>
              <p className="eyebrow">Career comparison</p>
              <h2>Player v player</h2>
            </div>
          </header>
          <div className="comparison-filter-box">
            <div className="comparison-filter-title">
              <strong>Filter these careers</strong>
              <button
                type="button"
                onClick={() => {
                  setComparisonStartYear(records.meta.seasonStart);
                  setComparisonEndYear(records.meta.seasonEnd);
                  setComparisonTeams([]);
                  setComparisonMatchType("");
                  setComparisonOpponent("");
                }}
              >
                Reset filters
              </button>
            </div>
            <div className="comparison-filter-grid">
              <ComparisonSelect
                label="From season"
                value={String(comparisonStartYear)}
                onChange={(value) => {
                  const next = Number(value ?? records.meta.seasonStart);
                  setComparisonStartYear(next);
                  if (next > comparisonEndYear) setComparisonEndYear(next);
                }}
                options={comparisonSeasons.map((season) => ({
                  id: String(season),
                  label: String(season),
                }))}
                placeholder={String(records.meta.seasonStart)}
              />
              <ComparisonSelect
                label="To season"
                value={String(comparisonEndYear)}
                onChange={(value) => {
                  const next = Number(value ?? records.meta.seasonEnd);
                  setComparisonEndYear(next);
                  if (next < comparisonStartYear) setComparisonStartYear(next);
                }}
                options={[...comparisonSeasons].reverse().map((season) => ({
                  id: String(season),
                  label: String(season),
                }))}
                placeholder={String(records.meta.seasonEnd)}
              />
              <ComparisonTeamSelect
                value={comparisonTeams}
                onChange={setComparisonTeams}
                options={records.meta.teams}
              />
              <ComparisonSelect
                label="Match type"
                value={comparisonMatchType || null}
                onChange={(value) => setComparisonMatchType(value ?? "")}
                options={records.meta.matchTypes.map((value) => ({
                  id: value,
                  label: value,
                }))}
                placeholder="All match types"
              />
              <ComparisonSelect
                label="Opponent"
                value={comparisonOpponent || null}
                onChange={(value) => setComparisonOpponent(value ?? "")}
                options={records.meta.oppositions.map((value) => ({
                  id: value,
                  label: value,
                }))}
                placeholder="All opponents"
              />
            </div>
            <div className="comparison-filter-chips" aria-label="Active filters">
              {comparisonStartYear !== records.meta.seasonStart && (
                <button
                  type="button"
                  onClick={() => setComparisonStartYear(records.meta.seasonStart)}
                >
                  From: {comparisonStartYear}<b aria-hidden="true">×</b>
                </button>
              )}
              {comparisonEndYear !== records.meta.seasonEnd && (
                <button
                  type="button"
                  onClick={() => setComparisonEndYear(records.meta.seasonEnd)}
                >
                  To: {comparisonEndYear}<b aria-hidden="true">×</b>
                </button>
              )}
              {comparisonTeams.map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() =>
                    setComparisonTeams((current) =>
                      current.filter((teamValue) => teamValue !== value),
                    )
                  }
                >
                  Team: {value}<b aria-hidden="true">×</b>
                </button>
              ))}
              {comparisonMatchType && (
                <button type="button" onClick={() => setComparisonMatchType("")}>
                  Match type: {comparisonMatchType}<b aria-hidden="true">×</b>
                </button>
              )}
              {comparisonOpponent && (
                <button type="button" onClick={() => setComparisonOpponent("")}>
                  Opponent: {comparisonOpponent}<b aria-hidden="true">×</b>
                </button>
              )}
              {comparisonStartYear === records.meta.seasonStart &&
                comparisonEndYear === records.meta.seasonEnd &&
                !comparisonTeams.length &&
                !comparisonMatchType &&
                !comparisonOpponent && <span>Showing all recorded matches</span>}
            </div>
          </div>
          <div className="comparison-selectors">
            <ComparisonSelect
              label="Player one"
              value={leftPlayer}
              onChange={(value) => setLeftPlayer(value ?? "")}
              options={playerOptions}
              placeholder="Select player"
              disabledKeys={[rightPlayer, thirdPlayer].filter(Boolean)}
            />
            <ComparisonSelect
              label="Player two"
              value={rightPlayer}
              onChange={(value) => setRightPlayer(value ?? "")}
              options={playerOptions}
              placeholder="Select player"
              disabledKeys={[leftPlayer, thirdPlayer].filter(Boolean)}
            />
            <ComparisonSelect
              label="Player three · optional"
              value={thirdPlayer || null}
              onChange={(value) => setThirdPlayer(value ?? "")}
              options={playerOptions}
              placeholder="Add a third player"
              disabledKeys={[leftPlayer, rightPlayer].filter(Boolean)}
            />
          </div>
          {selectedPlayers && (
            <div
              className={`comparison-table players-${selectedPlayers.length}`}
              role="table"
              aria-label="Player career comparison"
            >
              <div className="comparison-heading" role="row">
                <span role="columnheader">Statistic</span>
                {selectedPlayers.map((player) => (
                  <a
                    role="columnheader"
                    href={`${publicBasePath}/players/${player.entry.playerId}/`}
                    key={player.entry.playerId}
                  >
                    <span>{player.entry.name} →</span>
                    <small>
                      {player.stats.matches.size
                        ? `${integer.format(player.stats.matches.size)} filtered appearances`
                        : "No matching appearances"}
                    </small>
                  </a>
                ))}
              </div>
              <div className="comparison-metrics">
                {comparisonMetrics.map((item) => {
                  const outcomes = comparisonOutcomes(item);
                  return (
                    <div role="row" key={item.label}>
                      <span className="comparison-metric-label" role="rowheader">
                        {item.label}
                      </span>
                      {item.values.map((value, index) => {
                        const outcome = outcomes[index];
                        const icon =
                          outcome === "better"
                            ? "▲"
                            : outcome === "weaker"
                              ? "▼"
                              : outcome === "middle"
                                ? "—"
                              : outcome === "level"
                                ? "="
                                : null;
                        return (
                          <strong
                            className="comparison-value"
                            role="cell"
                            key={selectedPlayers[index].entry.playerId}
                          >
                            <small className="comparison-mobile-name">
                              {selectedPlayers[index].entry.name}
                            </small>
                            <span>
                              {item.format(value)}
                              {icon && (
                                <em className={outcome}>
                                  <span aria-hidden="true">{icon}</span>
                                  <span className="sr-only">{outcome}</span>
                                </em>
                              )}
                            </span>
                            {item.coverage?.[index] && (
                              <small>{item.coverage[index]}</small>
                            )}
                          </strong>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
