"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { canonicalOpponent, displayOpponent } from "../opponents";
import { SiteHeader } from "../site-header";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const pageSize = 48;

type ScoreSummary = {
  team: string | null;
  runs: number | null;
  wickets: number | null;
  overs: string | null;
};

type MatchIndexRow = {
  fixtureId: string;
  matchNumber: number;
  date: string;
  season: number;
  esccTeam: string | null;
  opposition: string | null;
  competition: string | null;
  outcome: string;
  result: string;
  teams: string[];
  players: string[];
  scores: ScoreSummary[];
  path: string;
};

type MatchIndex = {
  meta: {
    matchCount: number;
    seasonStart: number;
    seasonEnd: number;
    teams: string[];
    competitions: string[];
    oppositions: string[];
    outcomes: string[];
  };
  matches: MatchIndexRow[];
};

type Filters = {
  query: string;
  season: string;
  team: string;
  competition: string;
  outcome: string;
};

const initialFilters: Filters = {
  query: "",
  season: "All seasons",
  team: "All teams",
  competition: "All competitions",
  outcome: "All results",
};

const outcomeLabels: Record<string, string> = {
  win: "Won",
  loss: "Lost",
  tie: "Tied",
  draw: "Drawn",
  abandoned: "Abandoned",
  concession: "Conceded",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function scoreLabel(score: ScoreSummary) {
  if (score.runs === null) return "—";
  const wickets =
    score.wickets === null
      ? ""
      : score.wickets >= 10
        ? ""
        : `/${score.wickets}`;
  return `${score.runs}${wickets}`;
}

function scoreTeamLabel(score: ScoreSummary, match: MatchIndexRow) {
  if (
    score.team &&
    canonicalOpponent(score.team) === canonicalOpponent(match.opposition)
  ) {
    return displayOpponent(score.team);
  }
  return score.team;
}

function matchSearchText(match: MatchIndexRow) {
  return [
    match.esccTeam,
    match.opposition,
    canonicalOpponent(match.opposition),
    match.competition,
    match.result,
    ...match.teams,
    ...match.players,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function MatchesExplorer() {
  const [data, setData] = useState<MatchIndex | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [queryInput, setQueryInput] = useState("");
  const [visible, setVisible] = useState(pageSize);

  useEffect(() => {
    fetch(`${publicBasePath}/data/scorecards/index.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load match archive");
        return response.json() as Promise<MatchIndex>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const seasons = useMemo(() => {
    if (!data) return [];
    return Array.from(
      { length: data.meta.seasonEnd - data.meta.seasonStart + 1 },
      (_, index) => data.meta.seasonEnd - index,
    );
  }, [data]);

  const matches = useMemo(() => {
    if (!data) return [];
    const query = filters.query.trim().toLocaleLowerCase();
    return [...data.matches]
      .filter(
        (match) =>
          (!query || matchSearchText(match).includes(query)) &&
          (filters.season === "All seasons" ||
            match.season === Number(filters.season)) &&
          (filters.team === "All teams" || match.esccTeam === filters.team) &&
          (filters.competition === "All competitions" ||
            match.competition === filters.competition) &&
          (filters.outcome === "All results" ||
            match.outcome === filters.outcome),
      )
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          Number(right.fixtureId) - Number(left.fixtureId),
      );
  }, [data, filters]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisible(pageSize);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilter("query", queryInput.trim());
  }

  function clearSearch() {
    setQueryInput("");
    updateFilter("query", "");
  }

  if (error) {
    return (
      <main className="vault-app matches-app">
        <SiteHeader active="matches" />
        <section className="archive-state">
          <p className="eyebrow">Match archive</p>
          <h1>The scorecards could not be loaded.</h1>
          <p>Please refresh the page and try again.</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="vault-app matches-app">
        <SiteHeader active="matches" />
        <section className="archive-state" aria-live="polite">
          <p className="eyebrow">Match archive</p>
          <h1>Opening the Vault…</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="vault-app matches-app">
      <SiteHeader active="matches" />

      <section className="match-archive-hero">
        <div>
          <p className="eyebrow">Every available scorecard · 2004–2026</p>
          <h1>
            Match <em>archive.</em>
          </h1>
        </div>
        <p>
          Search <strong>{data.meta.matchCount.toLocaleString("en-GB")}</strong>{" "}
          Edinburgh South fixtures by player, opponent, team or result.
        </p>
      </section>

      <section className="matches-shell" aria-labelledby="match-results-title">
        <div className="match-filter-heading">
          <div>
            <span>Find a fixture</span>
            <h2 id="match-results-title">Scorecards</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilters(initialFilters);
              setQueryInput("");
              setVisible(pageSize);
            }}
          >
            Clear filters
          </button>
        </div>

        <form className="match-filters" onSubmit={submitSearch}>
          <label className="match-query">
            <span>Player or opposition</span>
            <div><input
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    updateFilter("query", queryInput.trim());
                  }
                }}
                placeholder="Search the archive"
              /><button type="submit">Search</button></div>
          </label>
          <label>
            <span>Season</span>
            <select
              value={filters.season}
              onChange={(event) => updateFilter("season", event.target.value)}
            >
              <option>All seasons</option>
              {seasons.map((season) => (
                <option value={season} key={season}>
                  {season}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Team</span>
            <select
              value={filters.team}
              onChange={(event) => updateFilter("team", event.target.value)}
            >
              <option>All teams</option>
              {data.meta.teams.map((team) => (
                <option key={team}>{team}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Competition</span>
            <select
              value={filters.competition}
              onChange={(event) =>
                updateFilter("competition", event.target.value)
              }
            >
              <option>All competitions</option>
              {data.meta.competitions.map((competition) => (
                <option key={competition}>{competition}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Result</span>
            <select
              value={filters.outcome}
              onChange={(event) => updateFilter("outcome", event.target.value)}
            >
              <option value="All results">All results</option>
              {data.meta.outcomes.map((outcome) => (
                <option value={outcome} key={outcome}>
                  {outcomeLabels[outcome] ?? outcome}
                </option>
              ))}
            </select>
          </label>
        </form>

        {filters.query && <div className="match-active-search"><span>Search</span><button type="button" onClick={clearSearch} aria-label={`Remove search for ${filters.query}`}>{filters.query} <b aria-hidden="true">×</b></button></div>}

        <div className="match-results-context" aria-live="polite">
          <span>
            <strong>{matches.length.toLocaleString("en-GB")}</strong> matching {matches.length === 1 ? "scorecard" : "scorecards"} · showing {Math.min(visible, matches.length).toLocaleString("en-GB")}
          </span>
          <span>Newest first</span>
        </div>

        <div className="match-list">
          {matches.slice(0, visible).map((match) => (
            <a
              className="match-card"
              href={`${publicBasePath}/matches/${match.fixtureId}`}
              key={match.fixtureId}
            >
              <div className="match-card-date">
                <span>{match.season}</span>
                <strong>{formatDate(match.date)}</strong>
              </div>
              <div className="match-card-main">
                <div className="match-card-labels">
                  <span>{match.esccTeam ?? "ESCC"}</span>
                  <span>{match.competition ?? "Match"}</span>
                  <span>Match #{match.matchNumber}</span>
                </div>
                <h3>v {displayOpponent(match.opposition)}</h3>
                <p>{match.result}</p>
              </div>
              <div className="match-card-scores" aria-label="Innings scores">
                {match.scores.map((score, index) => (
                  <span key={`${match.fixtureId}-${score.team}-${index}`}>
                    <small>{scoreTeamLabel(score, match)}</small>
                    <strong>{scoreLabel(score)}</strong>
                  </span>
                ))}
              </div>
              <span className={`match-outcome outcome-${match.outcome}`}>
                {outcomeLabels[match.outcome] ?? match.outcome}
              </span>
              <span className="match-card-arrow" aria-hidden="true">
                →
              </span>
            </a>
          ))}
        </div>

        {matches.length === 0 && (
          <p className="match-empty">No scorecards match those filters.</p>
        )}

        {visible < matches.length && (
          <div className="match-load-more">
            <button
              type="button"
              onClick={() =>
                setVisible((current) =>
                  Math.min(current + pageSize, matches.length),
                )
              }
            >
              Show {Math.min(pageSize, matches.length - visible)} more matches
            </button>
          </div>
        )}
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
