"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../site-header";
import { type PlayerDirectory, type PlayerDirectoryEntry } from "../statistics";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");

type DirectoryPlayer = PlayerDirectoryEntry & {
  appearances: number;
  runs: number;
  wickets: number;
};

export function PlayersDirectory() {
  const [directory, setDirectory] = useState<PlayerDirectory | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "appearances" | "runs" | "wickets">(
    "appearances",
  );
  const [limit, setLimit] = useState(96);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`${publicBasePath}/data/scorecards/player-directory.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Player directory unavailable");
        return response.json() as Promise<PlayerDirectory>;
      })
      .then(setDirectory)
      .catch(() => setFailed(true));
  }, []);

  const players = useMemo<DirectoryPlayer[]>(() => {
    if (!directory) return [];
    return directory.players.map((player) => ({
      ...player,
      appearances: player.career.appearances,
      runs: player.career.runs,
      wickets: player.career.wickets,
    }));
  }, [directory]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return players
      .filter(
        (player) =>
          !needle ||
          player.name.toLocaleLowerCase().includes(needle) ||
          player.aliases.some((alias) =>
            alias.toLocaleLowerCase().includes(needle),
          ),
      )
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name);
        const difference = right[sort] - left[sort];
        return difference || left.name.localeCompare(right.name);
      });
  }, [players, query, sort]);

  if (failed) {
    return (
      <>
        <SiteHeader active="players" />
        <main className="status-screen">
          <h1>Player profiles are temporarily unavailable.</h1>
        </main>
      </>
    );
  }

  if (!directory) {
    return (
      <>
        <SiteHeader active="players" />
        <main className="status-screen" aria-live="polite">
          <div className="loading-line" />
          <p>Opening the player archive…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader active="players" />
      <main className="portal-page player-directory-page">
        <header className="portal-page-heading">
          <p className="eyebrow">Career histories</p>
          <h1>Players</h1>
          <p>
            Search {integer.format(directory.playerCount)} permanent profiles,
            then explore every available career statistic by season.
          </p>
        </header>

        <section className="directory-controls" aria-label="Player filters">
          <label>
            <span>Find a player</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(96);
              }}
              placeholder="Search by name"
            />
          </label>
          <label>
            <span>Order by</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as typeof sort);
                setLimit(96);
              }}
            >
              <option value="appearances">Appearances</option>
              <option value="runs">Runs</option>
              <option value="wickets">Wickets</option>
              <option value="name">Name</option>
            </select>
          </label>
          <div>
            <strong>{integer.format(filtered.length)}</strong>
            <span>profiles found</span>
          </div>
        </section>

        <section className="player-directory-grid">
          {filtered.slice(0, limit).map((player) => (
            <a
              href={`${publicBasePath}/players/${player.playerId}/`}
              key={player.playerId}
            >
              <span className="player-monogram" aria-hidden="true">
                {player.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <h2>{player.name}</h2>
              <dl>
                <div>
                  <dt>Matches</dt>
                  <dd>{integer.format(player.appearances)}</dd>
                </div>
                <div>
                  <dt>Runs</dt>
                  <dd>{integer.format(player.runs)}</dd>
                </div>
                <div>
                  <dt>Wickets</dt>
                  <dd>{integer.format(player.wickets)}</dd>
                </div>
              </dl>
              <span className="profile-link">Open profile →</span>
            </a>
          ))}
        </section>

        {limit < filtered.length && (
          <button
            className="load-more"
            type="button"
            onClick={() => setLimit((current) => current + 96)}
          >
            Show more players
          </button>
        )}
      </main>
    </>
  );
}
