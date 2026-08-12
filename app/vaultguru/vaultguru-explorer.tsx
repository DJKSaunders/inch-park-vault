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
type ReportMode = "performances" | "summary";
type PerformanceMetric = "runs" | "balls" | "strikeRate" | "wickets" | "runsConceded" | "economy";
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
  results: string[];
  firstAction: "either" | "batting" | "fielding";
  inningsNumbers: number[];
  battingPosition: "all" | "opening" | "top" | "middle" | "lower";
  minimumRuns: number;
  minimumBalls: number;
  dismissalStatus: "either" | "out" | "notOut";
  minimumWickets: number;
  minimumOvers: number;
  maximumBowlingRuns: number;
};

type MatchContext = {
  fixtureId: string;
  date: string;
  team: string | null;
  esccTeam?: string | null;
  opposition: string | null;
  competition?: string | null;
  outcome: string;
  firstBattingRole: "escc" | "opponent" | null;
};

type BattingPerformance = {
  player: string;
  date: string;
  team: string;
  opposition: string;
  fixtureId: string;
  inningsNumberInMatch: number;
  battingPosition?: number;
  runs: number | null;
  balls: number | null;
  notOut: boolean;
};

type BowlingPerformance = {
  player: string;
  date: string;
  team: string;
  opposition: string;
  fixtureId: string;
  balls: number | null;
  runs: number | null;
  wickets: number | null;
};

type ReportRow = { label: string; stats: PlayerStats; playerId?: string };
type GeneratedConfig = {
  discipline: Discipline;
  groupBy: GroupBy;
  metric: Metric;
  minimum: number;
  sortAscending: boolean;
  reportMode: ReportMode;
  performanceMetric: PerformanceMetric;
  filters: Filters;
};
type SavedReport = { name: string; query: string };

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

function recordMatchKey(row: BattingRow | BowlingRow) {
  return `${row[5]}|${row[2]}|${canonicalOpponent(row[4])}`;
}

function rowPasses(
  row: BattingRow | BowlingRow,
  filters: Filters,
  contexts: Map<string, MatchContext[]>,
) {
  const matchContexts = contexts.get(recordMatchKey(row)) ?? [];
  const contextualMatch = matchContexts.some(
    (match) =>
      (filters.results.length === 0 || filters.results.includes(match.outcome)) &&
      (filters.firstAction === "either" ||
        (filters.firstAction === "batting" && match.firstBattingRole === "escc") ||
        (filters.firstAction === "fielding" && match.firstBattingRole === "opponent")),
  );
  return (
    row[1] >= filters.startYear &&
    row[1] <= filters.endYear &&
    (filters.teams.length === 0 || filters.teams.includes(row[2])) &&
    (filters.matchTypes.length === 0 || filters.matchTypes.includes(row[3])) &&
    (!filters.opposition ||
      canonicalOpponent(row[4])
        .toLowerCase()
        .includes(filters.opposition.toLowerCase())) &&
    ((filters.results.length === 0 && filters.firstAction === "either") || contextualMatch)
  );
}

function toggleItem(items: string[], item: string) {
  return items.includes(item)
    ? items.filter((current) => current !== item)
    : [...items, item];
}

function matchingContext(performance: BattingPerformance | BowlingPerformance, contexts: Map<string, MatchContext[]>) {
  return (contexts.get(`${performance.date}|${performance.team}|${canonicalOpponent(performance.opposition)}`) ?? [])[0];
}

function performancePasses(performance: BattingPerformance | BowlingPerformance, filters: Filters, contexts: Map<string, MatchContext[]>) {
  const context = matchingContext(performance, contexts);
  const year = Number(performance.date.slice(0, 4));
  return year >= filters.startYear && year <= filters.endYear &&
    (filters.teams.length === 0 || filters.teams.includes(performance.team)) &&
    (filters.matchTypes.length === 0 || (context?.competition && filters.matchTypes.includes(context.competition))) &&
    (!filters.opposition || canonicalOpponent(performance.opposition).toLowerCase().includes(filters.opposition.toLowerCase())) &&
    (filters.results.length === 0 || (context && filters.results.includes(context.outcome))) &&
    (filters.firstAction === "either" || (context && ((filters.firstAction === "batting" && context.firstBattingRole === "escc") || (filters.firstAction === "fielding" && context.firstBattingRole === "opponent"))));
}

function performanceGroup(performance: BattingPerformance | BowlingPerformance, groupBy: GroupBy, contexts: Map<string, MatchContext[]>) {
  if (groupBy === "player") return performance.player;
  if (groupBy === "season") return performance.date.slice(0, 4);
  if (groupBy === "team") return performance.team || "Unknown team";
  if (groupBy === "opposition") return canonicalOpponent(performance.opposition);
  return matchingContext(performance, contexts)?.competition || "Unknown match type";
}

export function VaultGuruExplorer() {
  const [data, setData] = useState<RecordsData | null>(null);
  const [playerIds, setPlayerIds] = useState<Record<string, string>>({});
  const [matchContexts, setMatchContexts] = useState<MatchContext[]>([]);
  const [battingPerformances, setBattingPerformances] = useState<BattingPerformance[]>([]);
  const [bowlingPerformances, setBowlingPerformances] = useState<BowlingPerformance[]>([]);
  const [failed, setFailed] = useState(false);
  const [discipline, setDiscipline] = useState<Discipline>("batting");
  const [groupBy, setGroupBy] = useState<GroupBy>("player");
  const [metric, setMetric] = useState<Metric>("runs");
  const [minimum, setMinimum] = useState(0);
  const [sortAscending, setSortAscending] = useState(false);
  const [reportMode, setReportMode] = useState<ReportMode>("performances");
  const [performanceMetric, setPerformanceMetric] = useState<PerformanceMetric>("runs");
  const [generatedConfig, setGeneratedConfig] = useState<GeneratedConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [filters, setFilters] = useState<Filters>({
    startYear: 2004,
    endYear: 2026,
    teams: [],
    matchTypes: [],
    opposition: "",
    results: [],
    firstAction: "either",
    inningsNumbers: [],
    battingPosition: "all",
    minimumRuns: 0,
    minimumBalls: 0,
    dismissalStatus: "either",
    minimumWickets: 0,
    minimumOvers: 0,
    maximumBowlingRuns: 0,
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
      fetch(`${publicBasePath}/data/scorecards/index.json`).then((response) => response.json()),
      fetch(`${publicBasePath}/data/scorecards/club-insights.json`).then((response) => response.json()),
      fetch(`${publicBasePath}/data/scorecards/batting-innings.json`).then((response) => response.json()),
      fetch(`${publicBasePath}/data/scorecards/bowling-spells.json`).then((response) => response.json()),
    ])
      .then(([records, identityMap, matchIndex, clubInsights, nextBatting, nextBowling]) => {
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
        const firstRole = new Map<string, "escc" | "opponent" | null>(
          clubInsights.matches.map((match: { fixtureId: string; firstBattingRole: "escc" | "opponent" | null }) => [match.fixtureId, match.firstBattingRole]),
        );
        setMatchContexts(matchIndex.matches.map((match: MatchContext) => ({
          ...match,
          team: match.esccTeam ?? match.team,
          firstBattingRole: firstRole.get(match.fixtureId) ?? null,
        })));
        setBattingPerformances(nextBatting);
        setBowlingPerformances(nextBowling);
        const params = new URLSearchParams(window.location.search);
        const nextDiscipline = (params.get("area") as Discipline | null) || "batting";
        const nextMetric = (params.get("metric") as Metric) || disciplineMetrics[nextDiscipline][0];
        const nextGroup = (params.get("group") as GroupBy) || "player";
        const nextMinimum = Number(params.get("minimum") || 0);
        const nextMode = (params.get("format") as ReportMode) || "performances";
        const nextPerformanceMetric = (params.get("performanceMetric") as PerformanceMetric) || (nextDiscipline === "bowling" ? "wickets" : "runs");
        const nextFilters: Filters = {
          startYear: Number(params.get("from") || records.meta.seasonStart),
          endYear: Number(params.get("to") || records.meta.seasonEnd),
          teams: params.get("teams")?.split(",").filter(Boolean) ?? [],
          matchTypes: params.get("types")?.split(",").filter(Boolean) ?? [],
          opposition: params.get("opposition") ?? "",
          results: params.get("results")?.split(",").filter(Boolean) ?? [],
          firstAction: (params.get("first") as Filters["firstAction"]) || "either",
          inningsNumbers: params.get("innings")?.split(",").map(Number).filter(Boolean) ?? [],
          battingPosition: (params.get("position") as Filters["battingPosition"]) || "all",
          minimumRuns: Number(params.get("runs") || 0),
          minimumBalls: Number(params.get("balls") || 0),
          dismissalStatus: (params.get("dismissal") as Filters["dismissalStatus"]) || "either",
          minimumWickets: Number(params.get("wickets") || 0),
          minimumOvers: Number(params.get("overs") || 0),
          maximumBowlingRuns: Number(params.get("conceded") || 0),
        };
        setDiscipline(nextDiscipline);
        setMetric(nextMetric);
        setGroupBy(nextGroup);
        setMinimum(nextMinimum);
        setReportMode(nextMode);
        setPerformanceMetric(nextPerformanceMetric);
        setFilters(nextFilters);
        if (params.get("generated") === "1") setGeneratedConfig({ discipline: nextDiscipline, metric: nextMetric, groupBy: nextGroup, minimum: nextMinimum, sortAscending: params.get("order") === "asc", reportMode: nextMode, performanceMetric: nextPerformanceMetric, filters: nextFilters });
        try { setSavedReports(JSON.parse(localStorage.getItem("vaultguru-reports") || "[]")); } catch { setSavedReports([]); }
        setReady(true);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    const closeOtherMenus = (event: MouseEvent) => {
      const summary = (event.target as Element | null)?.closest(".vaultguru-multi > summary");
      if (!summary) return;
      const current = summary.parentElement;
      document.querySelectorAll<HTMLDetailsElement>(".vaultguru-multi[open]").forEach((details) => {
        if (details !== current) details.removeAttribute("open");
      });
    };
    document.addEventListener("click", closeOtherMenus);
    return () => document.removeEventListener("click", closeOtherMenus);
  }, []);

  useEffect(() => {
    if (!ready || !data || !generatedConfig) return;
    const { discipline: appliedDiscipline, groupBy: appliedGroup, metric: appliedMetric, minimum: appliedMinimum, sortAscending: appliedAscending, reportMode: appliedMode, performanceMetric: appliedPerformanceMetric, filters: appliedFilters } = generatedConfig;
    const params = new URLSearchParams();
    params.set("generated", "1"); params.set("area", appliedDiscipline); params.set("format", appliedMode); params.set("group", appliedGroup); params.set("metric", appliedMetric); params.set("performanceMetric", appliedPerformanceMetric);
    if (appliedMinimum) params.set("minimum", String(appliedMinimum));
    if (appliedAscending) params.set("order", "asc");
    if (appliedFilters.startYear !== data.meta.seasonStart) params.set("from", String(appliedFilters.startYear));
    if (appliedFilters.endYear !== data.meta.seasonEnd) params.set("to", String(appliedFilters.endYear));
    if (appliedFilters.teams.length) params.set("teams", appliedFilters.teams.join(","));
    if (appliedFilters.matchTypes.length) params.set("types", appliedFilters.matchTypes.join(","));
    if (appliedFilters.opposition) params.set("opposition", appliedFilters.opposition);
    if (appliedFilters.results.length) params.set("results", appliedFilters.results.join(","));
    if (appliedFilters.firstAction !== "either") params.set("first", appliedFilters.firstAction);
    if (appliedFilters.inningsNumbers.length) params.set("innings", appliedFilters.inningsNumbers.join(","));
    if (appliedFilters.battingPosition !== "all") params.set("position", appliedFilters.battingPosition);
    if (appliedFilters.minimumRuns) params.set("runs", String(appliedFilters.minimumRuns));
    if (appliedFilters.minimumBalls) params.set("balls", String(appliedFilters.minimumBalls));
    if (appliedFilters.dismissalStatus !== "either") params.set("dismissal", appliedFilters.dismissalStatus);
    if (appliedFilters.minimumWickets) params.set("wickets", String(appliedFilters.minimumWickets));
    if (appliedFilters.minimumOvers) params.set("overs", String(appliedFilters.minimumOvers));
    if (appliedFilters.maximumBowlingRuns) params.set("conceded", String(appliedFilters.maximumBowlingRuns));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [data, generatedConfig, ready]);

  function saveReport() {
    const name = window.prompt("Name this report");
    if (!name?.trim()) return;
    const next = [...savedReports.filter((item) => item.name !== name.trim()), { name: name.trim(), query: window.location.search }];
    setSavedReports(next);
    localStorage.setItem("vaultguru-reports", JSON.stringify(next));
  }

  const contextMap = useMemo(() => {
    const map = new Map<string, MatchContext[]>();
    for (const match of matchContexts) {
      const key = `${match.date}|${match.team}|${canonicalOpponent(match.opposition)}`;
      map.set(key, [...(map.get(key) ?? []), match]);
    }
    return map;
  }, [matchContexts]);

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
    if (!data || !generatedConfig || generatedConfig.reportMode === "performances") return [];
    const { discipline, filters, groupBy, metric, minimum, sortAscending } = generatedConfig;
    const hasBattingQualification = filters.inningsNumbers.length > 0 || filters.battingPosition !== "all" || filters.minimumRuns > 0 || filters.minimumBalls > 0 || filters.dismissalStatus !== "either";
    const hasBowlingQualification = filters.minimumWickets > 0 || filters.minimumOvers > 0 || filters.maximumBowlingRuns > 0;
    if ((discipline === "batting" && hasBattingQualification) || (discipline === "bowling" && hasBowlingQualification)) {
      const grouped = new Map<string, ReportRow>();
      const get = (label: string) => {
        const existing = grouped.get(label);
        if (existing) return existing;
        const created = { label, stats: emptyPlayerStats(label), playerId: groupBy === "player" ? playerIds[label.toLowerCase()] : undefined };
        grouped.set(label, created);
        return created;
      };
      if (discipline === "batting") {
        for (const row of battingPerformances) {
          const position = row.battingPosition ?? 0;
          if (!performancePasses(row, filters, contextMap) ||
            (filters.inningsNumbers.length > 0 && !filters.inningsNumbers.includes(row.inningsNumberInMatch)) ||
            (filters.battingPosition === "opening" && position > 2) ||
            (filters.battingPosition === "top" && position > 3) ||
            (filters.battingPosition === "middle" && (position < 4 || position > 7)) ||
            (filters.battingPosition === "lower" && position < 8) ||
            (row.runs ?? 0) < filters.minimumRuns || (row.balls ?? 0) < filters.minimumBalls ||
            (filters.dismissalStatus === "notOut" && !row.notOut) || (filters.dismissalStatus === "out" && row.notOut)) continue;
          const stats = get(performanceGroup(row, groupBy, contextMap)).stats;
          const runs = row.runs ?? 0;
          stats.matches.add(row.fixtureId); stats.innings += 1; stats.runs += runs;
          if (!row.notOut) stats.outs += 1;
          if (runs > stats.highScore || (runs === stats.highScore && row.notOut)) { stats.highScore = runs; stats.highScoreNotOut = row.notOut; }
          if (runs >= 100) stats.hundreds += 1; else if (runs >= 50) stats.fifties += 1;
        }
      } else {
        for (const row of bowlingPerformances) {
          if (!performancePasses(row, filters, contextMap) || (row.wickets ?? 0) < filters.minimumWickets || (row.balls ?? 0) < filters.minimumOvers * 6 || (filters.maximumBowlingRuns > 0 && (row.runs ?? 0) > filters.maximumBowlingRuns)) continue;
          const stats = get(performanceGroup(row, groupBy, contextMap)).stats;
          const wickets = row.wickets ?? 0; const runs = row.runs ?? 0;
          stats.matches.add(row.fixtureId); stats.balls += row.balls ?? 0; stats.bowlingRuns += runs; stats.wickets += wickets;
          if (wickets > stats.bestWickets || (wickets === stats.bestWickets && runs < stats.bestRuns)) { stats.bestWickets = wickets; stats.bestRuns = runs; }
          if (wickets >= 5) stats.fiveWicketHauls += 1;
        }
      }
      return [...grouped.values()].filter((item) => item.stats.matches.size >= minimum).filter((item) => metricValue(metric, item.stats) !== null).sort((left, right) => {
        const a = metricValue(metric, left.stats) ?? 0; const b = metricValue(metric, right.stats) ?? 0;
        return sortAscending ? a - b : b - a;
      });
    }
    const batting = data.batting.filter((row) => rowPasses(row, filters, contextMap));
    const bowling = data.bowling.filter((row) => rowPasses(row, filters, contextMap));
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
  }, [battingPerformances, bowlingPerformances, contextMap, data, generatedConfig, playerIds]);

  const performanceReport = useMemo(() => {
    if (!generatedConfig || generatedConfig.reportMode !== "performances") return [];
    const { discipline, filters, performanceMetric, sortAscending } = generatedConfig;
    if (discipline === "batting") {
      return battingPerformances.filter((row) => {
        const position = row.battingPosition ?? 0;
        return performancePasses(row, filters, contextMap) &&
          (filters.inningsNumbers.length === 0 || filters.inningsNumbers.includes(row.inningsNumberInMatch)) &&
          (filters.battingPosition === "all" ||
            (filters.battingPosition === "opening" && position >= 1 && position <= 2) ||
            (filters.battingPosition === "top" && position >= 1 && position <= 3) ||
            (filters.battingPosition === "middle" && position >= 4 && position <= 7) ||
            (filters.battingPosition === "lower" && position >= 8 && position <= 11)) &&
          (row.runs ?? 0) >= filters.minimumRuns && (row.balls ?? 0) >= filters.minimumBalls &&
          (filters.dismissalStatus === "either" || (filters.dismissalStatus === "notOut" ? row.notOut : !row.notOut));
      }).sort((left, right) => {
        const value = (row: BattingPerformance) => performanceMetric === "balls" ? row.balls ?? 0 : performanceMetric === "strikeRate" ? (row.balls ? (row.runs ?? 0) * 100 / row.balls : -1) : row.runs ?? 0;
        return sortAscending ? value(left) - value(right) : value(right) - value(left);
      });
    }
    if (discipline === "bowling") {
      return bowlingPerformances.filter((row) => performancePasses(row, filters, contextMap) &&
        (row.wickets ?? 0) >= filters.minimumWickets && (row.balls ?? 0) >= filters.minimumOvers * 6 &&
        (filters.maximumBowlingRuns === 0 || (row.runs ?? 0) <= filters.maximumBowlingRuns)).sort((left, right) => {
          const value = (row: BowlingPerformance) => performanceMetric === "runsConceded" ? row.runs ?? 0 : performanceMetric === "economy" ? (row.balls ? (row.runs ?? 0) * 6 / row.balls : Number.POSITIVE_INFINITY) : row.wickets ?? 0;
          return sortAscending ? value(left) - value(right) : value(right) - value(left);
        });
    }
    return [];
  }, [battingPerformances, bowlingPerformances, contextMap, generatedConfig]);

  function chooseDiscipline(next: Discipline) {
    setDiscipline(next);
    setMetric(disciplineMetrics[next][0]);
    setReportMode(next === "batting" || next === "bowling" ? "performances" : "summary");
    setPerformanceMetric(next === "bowling" ? "wickets" : "runs");
    setSortAscending(false);
  }

  function generateReport() {
    setGeneratedConfig(currentDraftConfig());
    window.setTimeout(() => document.querySelector(".vaultguru-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function currentDraftConfig(): GeneratedConfig {
    return { discipline, groupBy, metric, minimum, sortAscending, reportMode, performanceMetric, filters: { ...filters, teams: [...filters.teams], matchTypes: [...filters.matchTypes], results: [...filters.results], inningsNumbers: [...filters.inningsNumbers] } };
  }

  function reset() {
    if (!data) return;
    setFilters({
      startYear: data.meta.seasonStart,
      endYear: data.meta.seasonEnd,
      teams: [],
      matchTypes: [],
      opposition: "",
      results: [], firstAction: "either", inningsNumbers: [], battingPosition: "all",
      minimumRuns: 0, minimumBalls: 0, dismissalStatus: "either",
      minimumWickets: 0, minimumOvers: 0, maximumBowlingRuns: 0,
    });
    setGroupBy("player");
    setMinimum(0);
    setReportMode("performances");
    setPerformanceMetric("runs");
    setGeneratedConfig(null);
  }

  function exportCsv() {
    if (!generatedConfig) return;
    let headings: Array<string>;
    let lines: Array<Array<string | number | boolean>>;
    if (generatedConfig.reportMode === "performances" && generatedConfig.discipline === "batting") {
      headings = ["Date", "Player", "Team", "Opposition", "Position", "Runs", "Not out", "Balls", "Strike rate", "Fixture"];
      lines = (performanceReport as BattingPerformance[]).map((row) => [row.date, row.player, row.team, canonicalOpponent(row.opposition), row.battingPosition ?? "", row.runs ?? "", row.notOut, row.balls ?? "", row.balls ? decimal.format((row.runs ?? 0) * 100 / row.balls) : "", row.fixtureId]);
    } else if (generatedConfig.reportMode === "performances") {
      headings = ["Date", "Player", "Team", "Opposition", "Overs", "Runs conceded", "Wickets", "Economy", "Fixture"];
      lines = (performanceReport as BowlingPerformance[]).map((row) => [row.date, row.player, row.team, canonicalOpponent(row.opposition), oversFromBalls(row.balls ?? 0), row.runs ?? "", row.wickets ?? "", row.balls ? decimal.format((row.runs ?? 0) * 6 / row.balls) : "", row.fixtureId]);
    } else {
      headings = [
      generatedConfig.groupBy === "player" ? "Player" : "Group",
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
      lines = report.map(({ label, stats }) => [
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
    }
    const csv = [headings, ...lines]
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `vaultguru-${generatedConfig.discipline}-${generatedConfig.reportMode}.csv`;
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
    filters.results.length + Number(filters.firstAction !== "either") +
    filters.inningsNumbers.length + Number(filters.battingPosition !== "all") +
    Number(filters.minimumRuns > 0 || filters.minimumBalls > 0 || filters.dismissalStatus !== "either") +
    Number(filters.minimumWickets > 0 || filters.minimumOvers > 0 || filters.maximumBowlingRuns > 0) +
    Number(filters.startYear !== data.meta.seasonStart || filters.endYear !== data.meta.seasonEnd);
  const reportNeedsUpdate = generatedConfig !== null && JSON.stringify(generatedConfig) !== JSON.stringify(currentDraftConfig());

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
          <div className="vaultguru-report-actions"><button type="button" onClick={saveReport}>Save report</button>{savedReports.length > 0 && <select aria-label="Open saved report" defaultValue="" onChange={(event) => { if (event.target.value) window.location.search = event.target.value; }}><option value="">Saved reports</option>{savedReports.map((report) => <option value={report.query} key={report.name}>{report.name}</option>)}</select>}<button type="button" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy link</button><button type="button" onClick={reset}>Reset report</button></div>
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
              <details className="vaultguru-multi"><summary><span>Match result</span><strong>{filters.results.length ? `${filters.results.length} selected` : "All results"}</strong></summary><div>{["win","loss","tie","draw"].map((result) => <label key={result}><input type="checkbox" checked={filters.results.includes(result)} onChange={() => setFilters((current) => ({...current, results: toggleItem(current.results,result)}))}/>{result}</label>)}</div></details>
              <label><span>At the start</span><select value={filters.firstAction} onChange={(event) => setFilters((current) => ({...current, firstAction:event.target.value as Filters["firstAction"]}))}><option value="either">Batted or fielded first</option><option value="batting">Batted first</option><option value="fielding">Fielded first</option></select></label>
              {discipline === "batting" && <><details className="vaultguru-multi"><summary><span>Innings number</span><strong>{filters.inningsNumbers.length ? filters.inningsNumbers.join(", ") : "Any innings"}</strong></summary><div>{[1,2].map((number) => <label key={number}><input type="checkbox" checked={filters.inningsNumbers.includes(number)} onChange={() => setFilters((current) => ({...current, inningsNumbers: current.inningsNumbers.includes(number) ? current.inningsNumbers.filter((item) => item !== number) : [...current.inningsNumbers,number]}))}/>{number === 1 ? "First" : "Second"} innings</label>)}</div></details><label><span>Batting position</span><select value={filters.battingPosition} onChange={(event) => setFilters((current) => ({...current, battingPosition:event.target.value as Filters["battingPosition"]}))}><option value="all">All positions</option><option value="opening">Openers (1–2)</option><option value="top">Top order (1–3)</option><option value="middle">Middle order (4–7)</option><option value="lower">Lower order (8–11)</option></select></label><label><span>Minimum runs</span><input type="number" min="0" value={filters.minimumRuns} onChange={(event) => setFilters((current) => ({...current,minimumRuns:Number(event.target.value)}))}/></label><label><span>Minimum balls</span><input type="number" min="0" value={filters.minimumBalls} onChange={(event) => setFilters((current) => ({...current,minimumBalls:Number(event.target.value)}))}/></label><label><span>Dismissal</span><select value={filters.dismissalStatus} onChange={(event) => setFilters((current) => ({...current,dismissalStatus:event.target.value as Filters["dismissalStatus"]}))}><option value="either">Out or not out</option><option value="out">Out</option><option value="notOut">Not out</option></select></label></>}
              {discipline === "bowling" && <><label><span>Minimum wickets</span><input type="number" min="0" value={filters.minimumWickets} onChange={(event) => setFilters((current) => ({...current,minimumWickets:Number(event.target.value)}))}/></label><label><span>Minimum overs</span><input type="number" min="0" value={filters.minimumOvers} onChange={(event) => setFilters((current) => ({...current,minimumOvers:Number(event.target.value)}))}/></label><label><span>Maximum runs conceded</span><input type="number" min="0" value={filters.maximumBowlingRuns} onChange={(event) => setFilters((current) => ({...current,maximumBowlingRuns:Number(event.target.value)}))}/></label></>}
            </div>
            <div className="vaultguru-chips">
              {filters.teams.map((team) => <button type="button" key={team} onClick={() => setFilters((current) => ({ ...current, teams: toggleItem(current.teams, team) }))}>{team} ×</button>)}
              {filters.matchTypes.map((type) => <button type="button" key={type} onClick={() => setFilters((current) => ({ ...current, matchTypes: toggleItem(current.matchTypes, type) }))}>{type} ×</button>)}
              {filters.opposition && <button type="button" onClick={() => setFilters((current) => ({ ...current, opposition: "" }))}>vs {filters.opposition} ×</button>}
              {filters.results.map((result) => <button type="button" key={result} onClick={() => setFilters((current) => ({ ...current, results: toggleItem(current.results, result) }))}>{result} ×</button>)}
              {filters.firstAction !== "either" && <button type="button" onClick={() => setFilters((current) => ({ ...current, firstAction: "either" }))}>{filters.firstAction === "batting" ? "Batted first" : "Fielded first"} ×</button>}
              {filters.inningsNumbers.map((number) => <button type="button" key={number} onClick={() => setFilters((current) => ({ ...current, inningsNumbers: current.inningsNumbers.filter((item) => item !== number) }))}>{number === 1 ? "First" : "Second"} innings ×</button>)}
              {filters.battingPosition !== "all" && <button type="button" onClick={() => setFilters((current) => ({ ...current, battingPosition: "all" }))}>{filters.battingPosition} order ×</button>}
              {filters.minimumRuns > 0 && <button type="button" onClick={() => setFilters((current) => ({ ...current, minimumRuns: 0 }))}>{filters.minimumRuns}+ runs ×</button>}
              {filters.minimumBalls > 0 && <button type="button" onClick={() => setFilters((current) => ({ ...current, minimumBalls: 0 }))}>{filters.minimumBalls}+ balls ×</button>}
              {filters.minimumWickets > 0 && <button type="button" onClick={() => setFilters((current) => ({ ...current, minimumWickets: 0 }))}>{filters.minimumWickets}+ wickets ×</button>}
              {filters.minimumOvers > 0 && <button type="button" onClick={() => setFilters((current) => ({ ...current, minimumOvers: 0 }))}>{filters.minimumOvers}+ overs ×</button>}
            </div>
          </fieldset>

          <fieldset>
            <legend><b>03</b> Shape the results</legend>
            <div className="vaultguru-filter-grid vaultguru-shape-grid">
              <label><span>Report format</span><select value={reportMode} disabled={discipline === "fielding" || discipline === "allround"} onChange={(event) => setReportMode(event.target.value as ReportMode)}><option value="performances">Individual performances</option><option value="summary">Summary table</option></select></label>
              {reportMode === "summary" ? <><label><span>Group rows by</span><select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}><option value="player">Player</option><option value="season">Season</option><option value="team">Team</option><option value="opposition">Opposition</option><option value="matchType">Match type</option></select></label>
              <label><span>Rank by</span><select value={metric} onChange={(event) => { const next = event.target.value as Metric; setMetric(next); setSortAscending(["average", "bowlingAverage", "economy", "bowlingStrikeRate"].includes(next)); }}>{disciplineMetrics[discipline].map((item) => <option value={item} key={item}>{metricLabels[item]}</option>)}</select></label>
              <label><span>Minimum appearances</span><select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}><option value="0">Any</option><option value="5">5+</option><option value="10">10+</option><option value="25">25+</option><option value="50">50+</option></select></label></> : <label><span>Rank performances by</span><select value={performanceMetric} onChange={(event) => { const next = event.target.value as PerformanceMetric; setPerformanceMetric(next); setSortAscending(next === "economy" || next === "runsConceded"); }}>{discipline === "bowling" ? <><option value="wickets">Wickets</option><option value="runsConceded">Runs conceded</option><option value="economy">Economy</option></> : <><option value="runs">Runs</option><option value="balls">Balls faced</option><option value="strikeRate">Strike rate</option></>}</select></label>}
              <button type="button" className="vaultguru-sort" onClick={() => setSortAscending((current) => !current)}>{sortAscending ? "Lowest first ↑" : "Highest first ↓"}</button>
            </div>
          </fieldset>
        </div>
        <footer className={`vaultguru-generate${reportNeedsUpdate ? " changed" : ""}`}><div><strong>{reportNeedsUpdate ? "Parameters changed" : generatedConfig ? "Report generated" : "Ready to build"}</strong><span>{reportNeedsUpdate ? "Generate again to apply these changes." : "Results will only change when you generate the report."}</span></div><button type="button" onClick={generateReport}>{generatedConfig ? "Update report →" : "Generate report →"}</button></footer>
      </section>

      {generatedConfig ? <section className="vaultguru-results">
        <header>
          <div><span>Generated report</span><h2>{generatedConfig.reportMode === "performances" ? `${generatedConfig.discipline === "bowling" ? "Bowling spells" : "Batting innings"}` : `${metricLabels[generatedConfig.metric]} by ${generatedConfig.groupBy === "matchType" ? "match type" : generatedConfig.groupBy}`}</h2><p>{integer.format(generatedConfig.reportMode === "performances" ? performanceReport.length : report.length)} rows · {generatedConfig.filters.startYear}–{generatedConfig.filters.endYear}</p></div>
          <button type="button" onClick={exportCsv} disabled={(generatedConfig.reportMode === "performances" ? performanceReport.length : report.length) === 0}>Export CSV</button>
        </header>
        {generatedConfig.reportMode === "summary" ? <div className="stats-table-wrap">
          <table className="stats-table vaultguru-table">
            <thead><tr><th>Rank</th><th>{generatedConfig.groupBy === "player" ? "Player" : "Group"}</th><th>Mat</th><th>Inn</th><th>Runs</th><th>Bat avg</th><th>HS</th><th>Overs</th><th>Wkts</th><th>Bowl avg</th><th>Econ</th><th>Bowl SR</th><th>Ct</th><th>St</th></tr></thead>
            <tbody>{report.slice(0, 200).map(({ label, stats, playerId }, index) => <tr key={label}><td>{String(index + 1).padStart(2, "0")}</td><th scope="row">{playerId ? <a href={`${publicBasePath}/players/${playerId}/`}>{label}</a> : label}</th><td>{integer.format(stats.matches.size)}</td><td>{integer.format(stats.innings)}</td><td className={generatedConfig.metric === "runs" || generatedConfig.metric === "runsAndWickets" ? "active-sort" : ""}>{integer.format(stats.runs)}</td><td>{battingAverage(stats) === null ? "—" : decimal.format(battingAverage(stats)!)}</td><td>{integer.format(stats.highScore)}</td><td>{oversFromBalls(stats.balls)}</td><td>{integer.format(stats.wickets)}</td><td>{bowlingAverage(stats) === null ? "—" : decimal.format(bowlingAverage(stats)!)}</td><td>{economy(stats) === null ? "—" : decimal.format(economy(stats)!)}</td><td>{bowlingStrikeRate(stats) === null ? "—" : decimal.format(bowlingStrikeRate(stats)!)}</td><td>{integer.format(stats.catches)}</td><td>{integer.format(stats.stumpings)}</td></tr>)}</tbody>
          </table>
        </div> : generatedConfig.discipline === "batting" ? <div className="stats-table-wrap"><table className="stats-table vaultguru-table vaultguru-performance-table"><thead><tr><th>Rank</th><th>Date</th><th>Player</th><th>Team</th><th>Opposition</th><th>Pos</th><th>Runs</th><th>Balls</th><th>SR</th><th>Dismissal</th><th>Match</th></tr></thead><tbody>{(performanceReport as BattingPerformance[]).slice(0, 500).map((row, index) => <tr key={`${row.fixtureId}-${row.player}-${row.inningsNumberInMatch}`}><td>{String(index + 1).padStart(2, "0")}</td><td>{row.date}</td><th scope="row">{playerIds[row.player.toLowerCase()] ? <a href={`${publicBasePath}/players/${playerIds[row.player.toLowerCase()]}/`}>{row.player}</a> : row.player}</th><td>{row.team}</td><td>{canonicalOpponent(row.opposition)}</td><td>{row.battingPosition ?? "—"}</td><td className="active-sort">{row.runs ?? "—"}{row.notOut ? "*" : ""}</td><td>{row.balls ?? "—"}</td><td>{row.balls ? decimal.format((row.runs ?? 0) * 100 / row.balls) : "—"}</td><td>{row.notOut ? "Not out" : "Out"}</td><td><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>View →</a></td></tr>)}</tbody></table></div> : <div className="stats-table-wrap"><table className="stats-table vaultguru-table vaultguru-performance-table"><thead><tr><th>Rank</th><th>Date</th><th>Player</th><th>Team</th><th>Opposition</th><th>Overs</th><th>Runs</th><th>Wkts</th><th>Econ</th><th>Match</th></tr></thead><tbody>{(performanceReport as BowlingPerformance[]).slice(0, 500).map((row, index) => <tr key={`${row.fixtureId}-${row.player}`}><td>{String(index + 1).padStart(2, "0")}</td><td>{row.date}</td><th scope="row">{playerIds[row.player.toLowerCase()] ? <a href={`${publicBasePath}/players/${playerIds[row.player.toLowerCase()]}/`}>{row.player}</a> : row.player}</th><td>{row.team}</td><td>{canonicalOpponent(row.opposition)}</td><td>{oversFromBalls(row.balls ?? 0)}</td><td>{row.runs ?? "—"}</td><td className="active-sort">{row.wickets ?? "—"}</td><td>{row.balls ? decimal.format((row.runs ?? 0) * 6 / row.balls) : "—"}</td><td><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>View →</a></td></tr>)}</tbody></table></div>}
        {(generatedConfig.reportMode === "performances" ? performanceReport.length : report.length) === 0 && <p className="empty-state">No results meet these report conditions.</p>}
      </section> : <section className="vaultguru-results vaultguru-results-empty"><p className="eyebrow">Generated report</p><h2>Set your parameters, then generate a report</h2><p>Your results will appear here without changing while you adjust the next query.</p></section>}
    </main>
  );
}
