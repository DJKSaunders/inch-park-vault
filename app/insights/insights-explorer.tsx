"use client";

import { useEffect, useMemo, useState } from "react";
import { SeasonChart } from "../components/season-chart";
import { SiteHeader } from "../site-header";
import {
  aggregatePlayer,
  battingAverage,
  bowlingAverage,
  economy,
  rowsForAliases,
  type PlayerDirectory,
  type PlayerDirectoryEntry,
  type RecordsData,
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
  const [team, setTeam] = useState("All teams");
  const [competition, setCompetition] = useState("All competitions");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("runs");
  const [leftPlayer, setLeftPlayer] = useState("");
  const [rightPlayer, setRightPlayer] = useState("");
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
    ])
      .then(([nextRecords, nextDirectory, nextMatches]) => {
        setRecords(nextRecords);
        setDirectory(nextDirectory);
        setMatches(nextMatches);
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
      })
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
    const seasons = new Map<number, number>();
    if (trendMetric === "runs") {
      for (const row of filteredRows.batting) {
        if (!row[8] && typeof row[6] === "number") {
          seasons.set(row[1], (seasons.get(row[1]) ?? 0) + row[6]);
        }
      }
    } else if (trendMetric === "wickets") {
      for (const row of filteredRows.bowling) {
        seasons.set(row[1], (seasons.get(row[1]) ?? 0) + row[9]);
      }
    } else {
      for (const match of matches.matches) {
        if (
          (team === "All teams" || match.esccTeam === team) &&
          (competition === "All competitions" ||
            match.competition === competition)
        ) {
          seasons.set(match.season, (seasons.get(match.season) ?? 0) + 1);
        }
      }
    }
    return [...seasons]
      .map(([season, value]) => ({
        season,
        value,
        display: integer.format(value),
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

  const selectedPlayers = useMemo(() => {
    if (!directory || !records) return null;
    const left = directory.players.find((player) => player.playerId === leftPlayer);
    const right = directory.players.find(
      (player) => player.playerId === rightPlayer,
    );
    if (!left || !right) return null;
    return {
      left: { entry: left, stats: comparisonValue(left, records) },
      right: { entry: right, stats: comparisonValue(right, records) },
    };
  }, [directory, leftPlayer, records, rightPlayer]);

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

  if (!records || !directory || !matches) {
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

  const comparisonMetrics = selectedPlayers
    ? [
        {
          label: "Appearances",
          left: selectedPlayers.left.stats.matches.size,
          right: selectedPlayers.right.stats.matches.size,
          format: (value: number) => integer.format(value),
        },
        {
          label: "Runs",
          left: selectedPlayers.left.stats.runs,
          right: selectedPlayers.right.stats.runs,
          format: (value: number) => integer.format(value),
        },
        {
          label: "Batting average",
          left: battingAverage(selectedPlayers.left.stats) ?? 0,
          right: battingAverage(selectedPlayers.right.stats) ?? 0,
          format: (value: number) => decimal.format(value),
        },
        {
          label: "Highest score",
          left: selectedPlayers.left.stats.highScore,
          right: selectedPlayers.right.stats.highScore,
          format: (value: number) => integer.format(value),
        },
        {
          label: "Wickets",
          left: selectedPlayers.left.stats.wickets,
          right: selectedPlayers.right.stats.wickets,
          format: (value: number) => integer.format(value),
        },
        {
          label: "Bowling average",
          left: bowlingAverage(selectedPlayers.left.stats) ?? 0,
          right: bowlingAverage(selectedPlayers.right.stats) ?? 0,
          format: (value: number) => (value > 0 ? decimal.format(value) : "—"),
        },
        {
          label: "Economy",
          left: economy(selectedPlayers.left.stats) ?? 0,
          right: economy(selectedPlayers.right.stats) ?? 0,
          format: (value: number) => (value > 0 ? decimal.format(value) : "—"),
        },
        {
          label: "Catches",
          left: selectedPlayers.left.stats.catches,
          right: selectedPlayers.right.stats.catches,
          format: (value: number) => integer.format(value),
        },
      ]
    : [];

  return (
    <>
      <SiteHeader active="insights" />
      <main className="portal-page insights-page">
        <header className="portal-page-heading">
          <p className="eyebrow">Visual analysis</p>
          <h1>Insights</h1>
          <p>
            Follow the archive through time, inspect team outcomes and compare
            two careers on the same scale.
          </p>
        </header>

        <section className="insight-filter-bar">
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
            note={
              trendMetric === "fixtures"
                ? "Counts are source fixture records; mirrored intra-club scorecards remain separate fixture records."
                : "Performance totals use the authoritative Vault records."
            }
          />
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

        <section className="insight-panel comparison-panel">
          <header>
            <div>
              <p className="eyebrow">Career comparison</p>
              <h2>Player v player</h2>
            </div>
          </header>
          <div className="comparison-selectors">
            <label>
              <span>Player one</span>
              <select
                value={leftPlayer}
                onChange={(event) => setLeftPlayer(event.target.value)}
              >
                {directory.players.map((player) => (
                  <option value={player.playerId} key={player.playerId}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <span aria-hidden="true">versus</span>
            <label>
              <span>Player two</span>
              <select
                value={rightPlayer}
                onChange={(event) => setRightPlayer(event.target.value)}
              >
                {directory.players.map((player) => (
                  <option value={player.playerId} key={player.playerId}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedPlayers && (
            <>
              <div className="comparison-names">
                <a
                  href={`${publicBasePath}/players/${selectedPlayers.left.entry.playerId}/`}
                >
                  {selectedPlayers.left.entry.name} →
                </a>
                <a
                  href={`${publicBasePath}/players/${selectedPlayers.right.entry.playerId}/`}
                >
                  {selectedPlayers.right.entry.name} →
                </a>
              </div>
              <div className="comparison-metrics">
                {comparisonMetrics.map((item) => {
                  const maximum = Math.max(item.left, item.right, 1);
                  return (
                    <div key={item.label}>
                      <strong>{item.format(item.left)}</strong>
                      <div className="comparison-track left">
                        <i style={{ width: `${(item.left / maximum) * 100}%` }} />
                      </div>
                      <span>{item.label}</span>
                      <div className="comparison-track right">
                        <i style={{ width: `${(item.right / maximum) * 100}%` }} />
                      </div>
                      <strong>{item.format(item.right)}</strong>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
