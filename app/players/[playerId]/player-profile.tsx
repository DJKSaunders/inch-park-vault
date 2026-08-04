"use client";

import { useEffect, useMemo, useState } from "react";
import { DismissalBreakdown } from "../../components/dismissal-pie";
import { SeasonChart } from "../../components/season-chart";
import { SiteHeader } from "../../site-header";
import {
  aggregatePlayer,
  aggregatePlayerBySeason,
  boundaryCareerTotals,
  boundarySeasons,
  metricDisplay,
  metricValue,
  profileMetricLabels,
  rowsForAliases,
  type PlayerDirectoryEntry,
  type ProfileMetric,
  type RecordsData,
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
}: {
  player: PlayerDirectoryEntry | null;
}) {
  const [records, setRecords] = useState<RecordsData | null>(null);
  const [history, setHistory] = useState<ScorecardPlayerHistory | null>(null);
  const [metric, setMetric] = useState<ProfileMetric>("runs");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!player) return;
    fetch(`${publicBasePath}/data/records.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Records unavailable");
        return response.json() as Promise<RecordsData>;
      })
      .then(setRecords)
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

  const rows = useMemo(
    () =>
      records && player
        ? rowsForAliases(records, player.aliases)
        : { batting: [], bowling: [] },
    [player, records],
  );
  const stats = useMemo(
    () =>
      player
        ? aggregatePlayer(player.name, rows.batting, rows.bowling)
        : null,
    [player, rows],
  );
  const seasons = useMemo(
    () =>
      player
        ? aggregatePlayerBySeason(player.name, rows.batting, rows.bowling)
        : new Map(),
    [player, rows],
  );
  const careerBoundaries = useMemo(
    () =>
      records && player
        ? boundaryCareerTotals(records, player.aliases)
        : { fours: 0, sixes: 0 },
    [player, records],
  );
  const seasonBoundaries = useMemo(() => boundarySeasons(history), [history]);
  const battingSeasons = useMemo(
    () => new Set(rows.batting.map((row) => row[1])),
    [rows.batting],
  );
  const bowlingSeasons = useMemo(
    () => new Set(rows.bowling.map((row) => row[1])),
    [rows.bowling],
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

  if (!records || !stats) {
    return (
      <>
        <SiteHeader active="players" />
        <main className="status-screen" aria-live="polite">
          <div className="loading-line" />
          <p>Opening {player.name}&apos;s profile…</p>
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
  const latestAppearances = [...(history?.appearances ?? [])]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 8);
  const dismissalCounts =
    player.scorecardMetrics?.dismissals ??
    ({} as NonNullable<typeof player.scorecardMetrics>["dismissals"]);
  const recordedNotOuts = (history?.battingInnings ?? []).filter(
    (innings) => innings.notOut,
  ).length;

  function appearanceSummary(
    appearance: NonNullable<typeof history>["appearances"][number],
  ) {
    const batting = (history?.battingInnings ?? []).filter(
      (innings) => innings.fixtureId === appearance.fixtureId,
    );
    const bowling = (history?.bowlingSpells ?? []).filter(
      (spell) => spell.fixtureId === appearance.fixtureId,
    );
    const parts: string[] = [];
    if (batting.length > 0) {
      parts.push(
        `Bat ${batting
          .map((innings) => {
            const score =
              innings.runs === null
                ? "—"
                : `${innings.runs}${innings.notOut ? "*" : ""}`;
            return innings.balls
              ? `${score} (${innings.balls}b${innings.strikeRate !== null ? `, SR ${decimal.format(innings.strikeRate)}` : ""})`
              : score;
          })
          .join(", ")}`,
      );
    } else if (appearance.didNotBat) {
      parts.push("Bat DNB");
    }
    if (bowling.length > 0) {
      parts.push(
        `Bowl ${bowling
          .map(
            (spell) => {
              const details = [
                spell.overs ? `${spell.overs} ov` : "",
                spell.economy !== null
                  ? `Econ ${decimal.format(spell.economy)}`
                  : "",
                spell.balls && spell.wickets
                  ? `SR ${decimal.format(spell.balls / spell.wickets)}`
                  : "",
              ].filter(Boolean);
              return `${spell.wickets ?? 0}/${spell.runs ?? "—"}${details.length ? ` (${details.join(", ")})` : ""}`;
            },
          )
          .join(", ")}`,
      );
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
    if (fielding.length > 0) parts.push(fielding.join(", "));
    return parts.join(" · ") || "No individual performance recorded";
  }

  return (
    <>
      <SiteHeader active="players" />
      <main className="portal-page player-profile-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <a href={`${publicBasePath}/players/`}>Players</a>
          <span aria-hidden="true">/</span>
          <span>{player.name}</span>
        </nav>

        <header className="profile-hero">
          <span className="profile-hero-monogram" aria-hidden="true">
            {player.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <p className="eyebrow">Player profile</p>
            <h1>{player.name}</h1>
            <p>
              {integer.format(stats.matches.size)} appearances ·{" "}
              {integer.format(stats.runs)} runs · {integer.format(stats.wickets)} wickets
            </p>
          </div>
          <a href={`${publicBasePath}/insights/?player=${player.playerId}`}>
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
                  ? player.scorecardMetrics
                    ? `Based on ${integer.format(player.scorecardMetrics.battingInningsWithBalls)} innings and ${integer.format(player.scorecardMetrics.battingBalls)} balls.`
                    : "No balls-faced data is available for this player."
                : undefined
            }
          />
        </section>

        <section className="profile-history-panel dismissal-profile-panel">
          <header>
            <div>
              <p className="eyebrow">Batting dismissals</p>
              <h2>How the wickets fell</h2>
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
            <span>
              {history
                ? `${integer.format(history.appearances.length)} linked scorecards`
                : "No linked scorecard history"}
            </span>
          </header>
          {latestAppearances.length > 0 ? (
            <div>
              {latestAppearances.map((appearance) => (
                <a
                  href={`${publicBasePath}/matches/${appearance.fixtureId}/`}
                  key={appearance.fixtureId}
                >
                  <time dateTime={appearance.date}>
                    {shortDate.format(new Date(`${appearance.date}T12:00:00`))}
                  </time>
                  <strong>
                    {appearance.team ?? "ESCC"} v{" "}
                    {appearance.opposition ?? "Opposition"}
                  </strong>
                  <span>{appearanceSummary(appearance)}</span>
                  <small>{appearance.outcome}</small>
                </a>
              ))}
            </div>
          ) : (
            <p className="profile-empty">
              Career totals are available, but this player has no linked
              scorecard appearances.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
