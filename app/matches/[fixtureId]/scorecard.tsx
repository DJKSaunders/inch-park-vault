"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "../../site-header";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type BattingRow = {
  rowNumber: number;
  playerId: string;
  player: string;
  dismissal: string | null;
  entryType: "innings" | "did-not-bat";
  notOut: boolean;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  strikeRate: number | null;
  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;
};

type BowlingRow = {
  rowNumber: number;
  playerId: string;
  player: string;
  overs: string | null;
  maidens: number | null;
  runs: number | null;
  wickets: number | null;
  economy: number | null;
};

type Innings = {
  id: string;
  number: number;
  battingTeam: string | null;
  battingTeamRole: "escc" | "opponent";
  bowlingTeam: string | null;
  bowlingTeamRole: "escc" | "opponent";
  total: {
    runs: number | null;
    wickets: number | null;
    overs: string | null;
    extras: Record<string, number>;
  } | null;
  batting: BattingRow[];
  bowling: BowlingRow[];
};

type PlayerDirectory = {
  players: {
    playerId: string;
    scorecardPlayerId: string | null;
  }[];
};

type Match = {
  fixtureId: string;
  matchNumber: number;
  date: string;
  season: number;
  title: string;
  esccTeam: string | null;
  opposition: string | null;
  competition: string | null;
  result: {
    summary: string;
    outcome: string;
  };
  innings: Innings[];
  provenance: {
    sourceUrl: string;
    authoritative: boolean;
  };
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function value(value: number | string | null, suffix = "") {
  return value === null ? "—" : `${value}${suffix}`;
}

function totalLabel(innings: Innings) {
  if (!innings.total || innings.total.runs === null) return "No total recorded";
  const wickets =
    innings.total.wickets === null
      ? ""
      : innings.total.wickets >= 10
        ? ""
        : `/${innings.total.wickets}`;
  return `${innings.total.runs}${wickets}`;
}

function extrasLabel(extras: Record<string, number>) {
  const entries = Object.entries(extras);
  if (!entries.length) return "No extras breakdown";
  return entries.map(([type, count]) => `${count}${type}`).join(" · ");
}

export function MatchScorecard({ fixtureId }: { fixtureId: string }) {
  const [match, setMatch] = useState<Match | null>(null);
  const [profileByScorecardId, setProfileByScorecardId] = useState<
    Map<string, string>
  >(new Map());
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${publicBasePath}/data/scorecards/matches/${fixtureId}.json`).then(
        (response) => {
          if (!response.ok) throw new Error("Unable to load scorecard");
          return response.json() as Promise<Match>;
        },
      ),
      fetch(`${publicBasePath}/data/scorecards/player-directory.json`).then(
        (response) => {
          if (!response.ok) throw new Error("Unable to load player links");
          return response.json() as Promise<PlayerDirectory>;
        },
      ),
    ])
      .then(([nextMatch, directory]) => {
        setMatch(nextMatch);
        setProfileByScorecardId(
          new Map(
            directory.players.flatMap((player) =>
              player.scorecardPlayerId
                ? [[player.scorecardPlayerId, player.playerId] as const]
                : [],
            ),
          ),
        );
      })
      .catch(() => setError(true));
  }, [fixtureId]);

  function playerName(
    player: string,
    scorecardPlayerId: string,
    isEscc: boolean,
  ) {
    const profileId = isEscc
      ? profileByScorecardId.get(scorecardPlayerId)
      : null;
    return profileId ? (
      <a
        className="scorecard-player-link"
        href={`${publicBasePath}/players/${profileId}/`}
      >
        {player}
      </a>
    ) : (
      player
    );
  }

  if (error) {
    return (
      <main className="vault-app scorecard-app">
        <SiteHeader active="matches" />
        <section className="archive-state">
          <p className="eyebrow">Scorecard unavailable</p>
          <h1>This scorecard could not be loaded.</h1>
          <a href={`${publicBasePath}/matches/`}>Return to the match archive</a>
        </section>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="vault-app scorecard-app">
        <SiteHeader active="matches" />
        <section className="archive-state" aria-live="polite">
          <p className="eyebrow">Match scorecard</p>
          <h1>Opening the scorecard…</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="vault-app scorecard-app">
      <SiteHeader active="matches" />

      <section className="scorecard-hero">
        <a className="scorecard-back" href={`${publicBasePath}/matches/`}>
          <span aria-hidden="true">←</span> Match archive
        </a>
        <div className="scorecard-meta">
          <span>{match.competition ?? "Match"}</span>
          <span>{match.esccTeam ?? "ESCC"}</span>
          <span>Match #{match.matchNumber}</span>
        </div>
        <h1>
          {match.esccTeam ?? "Edinburgh South"} <em>v</em>{" "}
          {match.opposition ?? "Opposition"}
        </h1>
        <p>{formatDate(match.date)}</p>
        <strong className={`scorecard-result outcome-${match.result.outcome}`}>
          {match.result.summary}
        </strong>
      </section>

      <section className="scorecard-shell">
        {match.innings.length > 0 ? (
          <div className="innings-summary" aria-label="Match scores">
            {match.innings.map((innings) => (
              <div key={innings.id}>
                <span>{innings.battingTeam}</span>
                <strong>{totalLabel(innings)}</strong>
                <small>
                  {innings.total?.overs
                    ? `${innings.total.overs} overs`
                    : "Overs unavailable"}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-innings">
            <strong>No innings were played.</strong>
            <span>The teams and result are retained from the fixture record.</span>
          </div>
        )}

        {match.innings.map((innings) => {
          const batters = innings.batting.filter(
            (row) => row.entryType === "innings",
          );
          const didNotBat = innings.batting.filter(
            (row) => row.entryType === "did-not-bat",
          );
          return (
            <article className="innings-card" key={innings.id}>
              <header>
                <div>
                  <span>Innings {innings.number}</span>
                  <h2>{innings.battingTeam}</h2>
                </div>
                <div className="innings-total">
                  <strong>{totalLabel(innings)}</strong>
                  <span>
                    {innings.total?.overs
                      ? `${innings.total.overs} overs`
                      : "Overs unavailable"}
                  </span>
                </div>
              </header>

              <section className="scorecard-section">
                <h3>Batting</h3>
                <div className="scorecard-table-scroll">
                  <table className="scorecard-table batting-card">
                    <caption>{innings.battingTeam} batting</caption>
                    <colgroup>
                      <col className="scorecard-player-column" />
                      <col className="scorecard-dismissal-column" />
                      <col className="scorecard-stat-column" span={5} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Dismissal</th>
                        <th>R</th>
                        <th>B</th>
                        <th>4s</th>
                        <th>6s</th>
                        <th>SR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batters.map((row) => (
                        <tr key={`${innings.id}-bat-${row.rowNumber}`}>
                          <th scope="row">
                            {playerName(
                              row.player,
                              row.playerId,
                              innings.battingTeamRole === "escc",
                            )}
                          </th>
                          <td>{row.dismissal ?? (row.notOut ? "Not out" : "—")}</td>
                          <td className="scorecard-primary">
                            {value(row.runs)}
                            {row.notOut ? "*" : ""}
                          </td>
                          <td>{value(row.balls)}</td>
                          <td>{value(row.fours)}</td>
                          <td>{value(row.sixes)}</td>
                          <td>{value(row.strikeRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {innings.total && (
                      <tfoot>
                        <tr>
                          <th colSpan={2}>Total</th>
                          <td className="scorecard-primary">
                            {totalLabel(innings)}
                          </td>
                          <td colSpan={4}>
                            {extrasLabel(innings.total.extras)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {didNotBat.length > 0 && (
                  <p className="did-not-bat">
                    <strong>Did not bat:</strong>{" "}
                    {didNotBat.map((row, index) => (
                      <span key={`${innings.id}-dnb-${row.rowNumber}`}>
                        {index > 0 ? ", " : ""}
                        {playerName(
                          row.player,
                          row.playerId,
                          innings.battingTeamRole === "escc",
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </section>

              <section className="scorecard-section">
                <h3>{innings.bowlingTeam} bowling</h3>
                <div className="scorecard-table-scroll">
                  <table className="scorecard-table bowling-card">
                    <caption>{innings.bowlingTeam} bowling</caption>
                    <colgroup>
                      <col className="scorecard-player-column" />
                      <col className="scorecard-stat-column" span={5} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Bowler</th>
                        <th>O</th>
                        <th>M</th>
                        <th>R</th>
                        <th>W</th>
                        <th>Econ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {innings.bowling.map((row) => (
                        <tr key={`${innings.id}-bowl-${row.rowNumber}`}>
                          <th scope="row">
                            {playerName(
                              row.player,
                              row.playerId,
                              innings.bowlingTeamRole === "escc",
                            )}
                          </th>
                          <td>{value(row.overs)}</td>
                          <td>{value(row.maidens)}</td>
                          <td>{value(row.runs)}</td>
                          <td className="scorecard-primary">
                            {value(row.wickets)}
                          </td>
                          <td>{value(row.economy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </article>
          );
        })}

        <aside className="scorecard-source">
          <a href={match.provenance.sourceUrl} target="_blank" rel="noreferrer">
            View original scorecard <span aria-hidden="true">↗</span>
          </a>
        </aside>
      </section>

      <footer>
        <div>
          <img src={`${publicBasePath}/escc-logo.png`} alt="" />
          <p>The Inch Park Vault</p>
        </div>
        <p>Edinburgh South Cricket Club Match Archive · 2004–2026</p>
      </footer>
    </main>
  );
}
