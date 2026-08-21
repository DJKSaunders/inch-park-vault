"use client";

import { useEffect, useMemo, useState } from "react";
import { DismissalBreakdown } from "../../components/dismissal-pie";
import { SeasonChart } from "../../components/season-chart";
import { capTooltip } from "../../cap-numbers";
import { SiteHeader } from "../../site-header";
import { displayFixtureOpponent } from "../../opponents";
import {
  boundarySeasons,
  inflatePlayerStats,
  metricDisplay,
  metricValue,
  profileMetricLabels,
  type PlayerDirectoryEntry,
  type PlayerProfileSummary,
  type ProfileMetric,
  type ScorecardPlayerHistory,
} from "../../statistics";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const statGroups: {
  title: string;
  metrics: ProfileMetric[];
}[] = [
  {
    title: "Batting",
    metrics: [
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
    ],
  },
  {
    title: "Bowling",
    metrics: [
      "overs",
      "maidens",
      "wickets",
      "fiveWicketHauls",
      "bowlingAverage",
      "economy",
      "bowlingStrikeRate",
      "bestBowling",
    ],
  },
  {
    title: "Fielding",
    metrics: ["catches", "stumpings", "runOuts"],
  },
];

export function PlayerProfile({
  player,
  capEntry,
}: {
  player: PlayerDirectoryEntry | null;
  capEntry: { capNumber: number; displayName: string } | null;
}) {
  const [profile, setProfile] = useState<PlayerProfileSummary | null>(null);
  const [history, setHistory] = useState<ScorecardPlayerHistory | null>(null);
  const [metric, setMetric] = useState<ProfileMetric>("runs");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(8);
  const [historySort, setHistorySort] = useState<"date" | "batting" | "bowling">("date");
  const [xiDiscipline, setXiDiscipline] = useState<"batting" | "bowling">("batting");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!player) return;
    fetch(`${publicBasePath}/data/scorecards/${player.profilePath}`)
      .then((response) => {
        if (!response.ok) throw new Error("Player summary unavailable");
        return response.json() as Promise<PlayerProfileSummary>;
      })
      .then(setProfile)
      .catch(() => setFailed(true));

    if (player.scorecardPath) {
      fetch(`${publicBasePath}/data/scorecards/${player.scorecardPath}`)
        .then((response) => {
          if (!response.ok) throw new Error("Scorecard history unavailable");
          return response.json() as Promise<ScorecardPlayerHistory>;
        })
        .then(setHistory)
        .catch(() => setHistory(null));
    }
  }, [player]);

  const stats = useMemo(
    () => (profile ? inflatePlayerStats(profile.career) : null),
    [profile],
  );
  const seasons = useMemo(
    () =>
      new Map(
        (profile?.seasons ?? []).map(({ season, stats: seasonStats }) => [
          season,
          inflatePlayerStats(seasonStats),
        ]),
      ),
    [profile],
  );
  const careerBoundaries = profile?.boundaries ?? { fours: 0, sixes: 0 };
  const teamRows = useMemo(
    () =>
      (profile?.teams ?? []).map((row) => ({
        team: row.team,
        stats: inflatePlayerStats(row.stats),
      })),
    [profile],
  );
  const seasonBoundaries = useMemo(() => boundarySeasons(history), [history]);
  const battingSeasons = useMemo(
    () => new Set(profile?.battingSeasons ?? []),
    [profile],
  );
  const bowlingSeasons = useMemo(
    () => new Set(profile?.bowlingSeasons ?? []),
    [profile],
  );

  const chartPoints = useMemo(() => {
    if (metric === "battingStrikeRate") {
      const summaries = new Map<number, { runs: number; balls: number }>();
      for (const innings of history?.battingInnings ?? []) {
        if (!innings.balls || innings.runs === null) continue;
        const summary = summaries.get(innings.season) ?? { runs: 0, balls: 0 };
        summary.runs += innings.runs;
        summary.balls += innings.balls;
        summaries.set(innings.season, summary);
      }
      return [...summaries]
        .map(([season, summary]) => {
          const value = (summary.runs * 100) / summary.balls;
          return { season, value, display: decimal.format(value) };
        })
        .sort((left, right) => left.season - right.season);
    }
    if (metric === "fours" || metric === "sixes") {
      const knownKey = metric === "fours" ? "foursKnown" : "sixesKnown";
      return [...seasonBoundaries]
        .filter(([, summary]) => summary[knownKey] > 0)
        .map(([season, summary]) => ({
          season,
          value: summary[metric],
          display: integer.format(summary[metric]),
        }))
        .sort((left, right) => left.season - right.season);
    }
    return [...seasons]
      .filter(([season]) => {
        if (metric === "matches") return true;
        if (
          metric === "overs" ||
          metric === "maidens" ||
          metric === "wickets" ||
          metric === "fiveWicketHauls" ||
          metric === "bowlingAverage" ||
          metric === "economy" ||
          metric === "bowlingStrikeRate" ||
          metric === "bestBowling"
        ) {
          return bowlingSeasons.has(season);
        }
        return battingSeasons.has(season);
      })
      .map(([season, seasonStats]) => {
        const value = metricValue(metric, seasonStats);
        return value === null
          ? null
          : {
              season,
              value,
              display: metricDisplay(metric, seasonStats),
            };
      })
      .filter(
        (
          point,
        ): point is { season: number; value: number; display: string } =>
          point !== null && Number.isFinite(point.value),
      )
      .sort((left, right) => left.season - right.season);
  }, [
    battingSeasons,
    bowlingSeasons,
    history,
    metric,
    seasonBoundaries,
    seasons,
  ]);

  const boundaryCoverage = useMemo(() => {
    const key = metric === "fours" ? "foursKnown" : "sixesKnown";
    return [...seasonBoundaries.values()].reduce(
      (coverage, season) => {
        coverage.known += season[key];
        coverage.innings += season.innings;
        return coverage;
      },
      { known: 0, innings: 0 },
    );
  }, [metric, seasonBoundaries]);

  if (!player) {
    return (
      <>
        <SiteHeader active="players" />
        <main className="status-screen">
          <h1>Player profile not found.</h1>
          <a href={`${publicBasePath}/players/`}>Return to players</a>
        </main>
      </>
    );
  }

  if (failed) {
    return (
      <>
        <SiteHeader active="players" />
        <main className="status-screen">
          <h1>This player profile is temporarily unavailable.</h1>
        </main>
      </>
    );
  }

  if (!profile || !stats) {
    return (
      <>
        <SiteHeader active="players" />
        <main className="status-screen" aria-live="polite">
          <div className="loading-line" />
          <p>Opening {capEntry?.displayName ?? player.name}&apos;s profile…</p>
        </main>
      </>
    );
  }

  const careerValue =
    metric === "fours" || metric === "sixes"
      ? integer.format(careerBoundaries[metric])
      : metric === "battingStrikeRate"
        ? player.scorecardMetrics?.battingStrikeRate !== null &&
          player.scorecardMetrics?.battingStrikeRate !== undefined
          ? decimal.format(player.scorecardMetrics.battingStrikeRate)
          : "—"
      : metricDisplay(metric, stats);
  const sortedAppearances = [...(history?.appearances ?? [])].sort((left, right) => {
    const battingScore = (fixtureId: string) => Math.max(...(history?.battingInnings ?? []).filter((innings) => innings.fixtureId === fixtureId).map((innings) => innings.runs ?? -1), -1);
    const bowlingFigures = (fixtureId: string) => (history?.bowlingSpells ?? [])
      .filter((spell) => spell.fixtureId === fixtureId)
      .map((spell) => ({ wickets: spell.wickets ?? 0, runs: spell.runs ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] ?? { wickets: -1, runs: Number.MAX_SAFE_INTEGER };
    if (historySort === "batting") return battingScore(right.fixtureId) - battingScore(left.fixtureId) || right.date.localeCompare(left.date);
    if (historySort === "bowling") {
      const leftFigures = bowlingFigures(left.fixtureId);
      const rightFigures = bowlingFigures(right.fixtureId);
      return rightFigures.wickets - leftFigures.wickets || leftFigures.runs - rightFigures.runs || right.date.localeCompare(left.date);
    }
    return right.date.localeCompare(left.date) || right.fixtureId.localeCompare(left.fixtureId);
  });
  const historyPageCount = Math.max(
    1,
    Math.ceil(sortedAppearances.length / historyPageSize),
  );
  const latestAppearances = sortedAppearances.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  );
  const dismissalCounts =
    player.scorecardMetrics?.dismissals ??
    ({} as NonNullable<typeof player.scorecardMetrics>["dismissals"]);
  const recordedNotOuts = (history?.battingInnings ?? []).filter(
    (innings) => innings.notOut,
  ).length;
  const battingStrikeRateCoverage = player.scorecardMetrics
    ? {
        known: player.scorecardMetrics.battingInningsWithBalls,
        total: stats.innings,
        percentage:
          stats.innings > 0
            ? Math.round(
                (player.scorecardMetrics.battingInningsWithBalls / stats.innings) *
                  100,
              )
            : 0,
      }
    : null;
  const displayName = capEntry?.displayName ?? player.name;

  function appearanceSummary(
    appearance: NonNullable<typeof history>["appearances"][number],
  ) {
    const batting = (history?.battingInnings ?? []).filter(
      (innings) => innings.fixtureId === appearance.fixtureId,
    );
    const bowling = (history?.bowlingSpells ?? []).filter(
      (spell) => spell.fixtureId === appearance.fixtureId,
    );
    let battingSummary = "—";
    if (batting.length > 0) {
      battingSummary = batting
          .map((innings) => {
            const score =
              innings.runs === null
                ? "—"
                : `${innings.runs}${innings.notOut ? "*" : ""}`;
            return score;
          })
          .join(", ");
    } else if (appearance.didNotBat) {
      battingSummary = "DNB";
    }
    let bowlingSummary = "—";
    if (bowling.length > 0) {
      bowlingSummary = bowling
          .map((spell) => `${spell.wickets ?? 0}/${spell.runs ?? "—"} (${spell.overs ?? "—"})`)
          .join(", ");
    }
    const fielding = [
      appearance.catches
        ? `${appearance.catches} catch${appearance.catches === 1 ? "" : "es"}`
        : "",
      appearance.stumpings
        ? `${appearance.stumpings} stumping${appearance.stumpings === 1 ? "" : "s"}`
        : "",
      appearance.runOuts
        ? `${appearance.runOuts} run out${appearance.runOuts === 1 ? "" : "s"}`
        : "",
    ].filter(Boolean);
    return {
      batting: battingSummary,
      bowling: bowlingSummary,
      fielding: fielding.join(", ") || "—",
    };
  }

  return (
    <>
      <SiteHeader active="players" />
      <main className="portal-page player-profile-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <a href={`${publicBasePath}/players/`}>Players</a>
          <span aria-hidden="true">/</span>
          <span>{displayName}</span>
        </nav>

        <header className="profile-hero">
          <span className="profile-hero-monogram" aria-hidden="true">
            {displayName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <div className="profile-identity-line">
              <p className="eyebrow">Player profile</p>
              {capEntry && (
                <span className="profile-cap-number" title={capTooltip}>
                  Cap #{integer.format(capEntry.capNumber)}
                </span>
              )}
            </div>
            <h1>{displayName}</h1>
            <p>
              {integer.format(stats.matches.size)} appearances ·{" "}
              {integer.format(stats.runs)} runs · {integer.format(stats.wickets)} wickets
            </p>
          </div>
          <a href={`${publicBasePath}/insights/players/compare/?player=${player.playerId}`}>
            Compare player →
          </a>
        </header>

        <section className="profile-stat-groups" aria-label="Career statistics">
          {statGroups.map((group) => (
            <div key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.metrics.map((key) => {
                  const value =
                    key === "fours" || key === "sixes"
                      ? integer.format(careerBoundaries[key])
                      : key === "battingStrikeRate"
                        ? player.scorecardMetrics?.battingStrikeRate !== null &&
                          player.scorecardMetrics?.battingStrikeRate !== undefined
                          ? decimal.format(player.scorecardMetrics.battingStrikeRate)
                          : "—"
                      : metricDisplay(key, stats);
                  return (
                    <button
                      type="button"
                      className={metric === key ? "active" : undefined}
                      onClick={() => setMetric(key)}
                      key={key}
                    >
                      <span>{profileMetricLabels[key]}</span>
                      <strong>{value}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="profile-chart-panel">
          <header>
            <div>
              <p className="eyebrow">Season trend</p>
              <h2>{profileMetricLabels[metric]}</h2>
            </div>
            <strong>{careerValue}</strong>
          </header>
          <SeasonChart
            label={profileMetricLabels[metric]}
            points={chartPoints}
            note={
              metric === "fours" || metric === "sixes"
                ? boundaryCoverage.innings > 0
                  ? `Boundary data available for ${integer.format(boundaryCoverage.known)} of ${integer.format(boundaryCoverage.innings)} innings.`
                  : "No season-by-season boundary data is available."
                : metric === "battingStrikeRate"
                  ? battingStrikeRateCoverage
                    ? `Balls faced recorded for ${integer.format(battingStrikeRateCoverage.known)} of ${integer.format(battingStrikeRateCoverage.total)} innings (${integer.format(battingStrikeRateCoverage.percentage)}%). Strike rate is calculated from those ${integer.format(player.scorecardMetrics?.battingBalls ?? 0)} recorded balls only.`
                    : "No balls-faced data is available for this player."
                : undefined
            }
          />
        </section>

        <section className="profile-history-panel profile-xi-summary">
          <header>
            <div>
              <p className="eyebrow">Career by team</p>
              <h2>XI summary</h2>
            </div>
            <span>Internal fixtures are shown separately from Mitres</span>
          </header>
          <div className="profile-xi-tabs" role="tablist" aria-label="XI summary discipline">
            <button type="button" role="tab" aria-selected={xiDiscipline === "batting"} className={xiDiscipline === "batting" ? "active" : undefined} onClick={() => setXiDiscipline("batting")}>Batting</button>
            <button type="button" role="tab" aria-selected={xiDiscipline === "bowling"} className={xiDiscipline === "bowling" ? "active" : undefined} onClick={() => setXiDiscipline("bowling")}>Bowling</button>
          </div>
          <div className="profile-xi-table-wrap">
            <table className={`profile-xi-table profile-xi-batting ${xiDiscipline === "batting" ? "active" : ""}`}>
              <caption>Batting by team</caption>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Matches</th><th scope="col">Inns</th><th scope="col">Runs</th><th scope="col">Avg</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map(({ team, stats: teamStats }) => (
                  <tr key={team}>
                    <th scope="row">{team}</th>
                    <td>{integer.format(teamStats.matches.size)}</td><td>{integer.format(teamStats.innings)}</td><td>{integer.format(teamStats.runs)}</td><td>{metricDisplay("battingAverage", teamStats)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td>{integer.format(stats.matches.size)}</td><td>{integer.format(stats.innings)}</td><td>{integer.format(stats.runs)}</td><td>{metricDisplay("battingAverage", stats)}</td>
                </tr>
              </tfoot>
            </table>
            <table className={`profile-xi-table profile-xi-bowling ${xiDiscipline === "bowling" ? "active" : ""}`}>
              <caption>Bowling by team</caption>
              <thead><tr><th scope="col">Team</th><th scope="col">Overs</th><th scope="col">Mdns</th><th scope="col">Runs</th><th scope="col">Wkts</th><th scope="col">Avg</th></tr></thead>
              <tbody>{teamRows.map(({ team, stats: teamStats }) => <tr key={team}><th scope="row">{team}</th><td>{metricDisplay("overs", teamStats)}</td><td>{integer.format(teamStats.maidens)}</td><td>{integer.format(teamStats.bowlingRuns)}</td><td>{integer.format(teamStats.wickets)}</td><td>{metricDisplay("bowlingAverage", teamStats)}</td></tr>)}</tbody>
              <tfoot><tr><th scope="row">Total</th><td>{metricDisplay("overs", stats)}</td><td>{integer.format(stats.maidens)}</td><td>{integer.format(stats.bowlingRuns)}</td><td>{integer.format(stats.wickets)}</td><td>{metricDisplay("bowlingAverage", stats)}</td></tr></tfoot>
            </table>
          </div>
        </section>

        <section className="profile-history-panel dismissal-profile-panel">
          <header>
            <div>
              <p className="eyebrow">Batting outcomes</p>
              <h2>Innings conclusion summary</h2>
            </div>
            <span>Recorded scorecard innings only</span>
          </header>
          <DismissalBreakdown
            counts={dismissalCounts}
            notOuts={recordedNotOuts}
          />
        </section>

        <section className="profile-history-panel">
          <header>
            <div>
              <p className="eyebrow">Scorecard history</p>
              <h2>Recent appearances</h2>
            </div>
            <label className="performance-sort">
              <span>Sort performances by</span>
              <select value={historySort} onChange={(event) => { setHistorySort(event.target.value as typeof historySort); setHistoryPage(1); }}>
                <option value="date">Date — newest first</option>
                <option value="batting">Batting score — highest first</option>
                <option value="bowling">Bowling figures — best first</option>
              </select>
            </label>
          </header>
          {latestAppearances.length > 0 ? (
            <div className="profile-appearance-table">
              <div className="profile-appearance-head" aria-hidden="true">
                <span>Match</span>
                <span>Batting</span>
                <span>Bowling</span>
                <span>Fielding</span>
              </div>
              {latestAppearances.map((appearance) => {
                const performance = appearanceSummary(appearance);
                return (
                  <a
                    href={`${publicBasePath}/matches/${appearance.fixtureId}/`}
                    key={appearance.fixtureId}
                  >
                    <div className="profile-appearance-match">
                      <time dateTime={appearance.date}>
                        {shortDate.format(new Date(`${appearance.date}T12:00:00`))}
                      </time>
                      <strong>
                        {appearance.team ?? "ESCC"} v{" "}
                        {displayFixtureOpponent(appearance.opposition, {
                          competition: appearance.competition,
                          esccTeam: appearance.team,
                        })}
                      </strong>
                      <small className={`profile-result-chip outcome-${appearance.outcome}`}>
                        {appearance.outcome}
                      </small>
                    </div>
                    <span className="profile-performance-figure" data-label="Batting">
                      {performance.batting}
                    </span>
                    <span className="profile-performance-figure" data-label="Bowling">
                      {performance.bowling}
                    </span>
                    <span className="profile-performance-figure" data-label="Fielding">{performance.fielding}</span>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="profile-empty">
              Career totals are available, but this player has no linked
              scorecard appearances.
            </p>
          )}
          {sortedAppearances.length > 8 && (
            <div className="profile-history-pagination">
              <label>
                <span>Appearances per page</span>
                <select
                  value={historyPageSize}
                  onChange={(event) => {
                    setHistoryPageSize(Number(event.target.value));
                    setHistoryPage(1);
                  }}
                >
                  {[8, 16, 25, 50, 100].map((size) => (
                    <option value={size} key={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              {historyPageCount > 1 && (
                <nav aria-label="Appearance pages">
                  <button
                    type="button"
                    disabled={historyPage === 1}
                    onClick={() => setHistoryPage((page) => page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {historyPage} of {historyPageCount}
                  </span>
                  <button
                    type="button"
                    disabled={historyPage === historyPageCount}
                    onClick={() => setHistoryPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
