"use client";

import { useMemo, useState } from "react";
import archive from "../../../public/data/archive-developments.json";
import { SiteHeader } from "../../site-header";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
type Section = "similarity" | "bests" | "progression" | "coverage";
type SimilarityMode = "batting" | "bowling" | "allround";
type BestMode = "battingStrikeRate" | "bowlingEconomy" | "bowlingStrikeRate";
type ProgressionMode = "highestScore" | "bestBowling";

const sectionCopy: Record<Section, { eyebrow: string; title: string; description: string }> = {
  similarity: { eyebrow: "Comparable careers", title: "Find similar players", description: "Select a player to discover active careers with the closest batting, bowling or all-round output." },
  bests: { eyebrow: "Single-match excellence", title: "Best individual performances", description: "Rank the strongest qualifying innings and bowling spells captured by the Vault’s scorecards." },
  progression: { eyebrow: "Changing benchmarks", title: "How records evolved", description: "Follow every occasion on which a player raised the archive’s highest score or best-bowling benchmark." },
  coverage: { eyebrow: "Confidence in the archive", title: "Data coverage", description: "See which seasons contain the detail needed for strike rates, boundary analysis and complete bowling figures." },
};

function formatDate(value: string) { return dateLabel.format(new Date(`${value}T12:00:00`)); }
function formatBestValue(row: { strikeRate?: number | null; economy?: number | null }, mode: BestMode) {
  return mode === "bowlingEconomy" ? `Econ ${row.economy ?? "—"}` : `SR ${row.strikeRate ?? "—"}`;
}
function formatProgressionValue(row: { runs: number; wickets?: number; notOut?: boolean }) {
  return row.wickets === undefined ? `${row.runs}${row.notOut ? "*" : ""}` : `${row.wickets}/${row.runs}`;
}

export function RecordsLab() {
  const [section, setSection] = useState<Section>("similarity");
  const [playerId, setPlayerId] = useState(archive.similarityPlayers[0]?.playerId ?? "");
  const [similarityMode, setSimilarityMode] = useState<SimilarityMode>("allround");
  const [bestMode, setBestMode] = useState<BestMode>("battingStrikeRate");
  const [bestLimit, setBestLimit] = useState(5);
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("highestScore");
  const [coverageLimit, setCoverageLimit] = useState(8);
  const selected = archive.similarityPlayers.find((player) => player.playerId === playerId) ?? archive.similarityPlayers[0];
  const similar = useMemo(() => !selected ? [] : archive.similarityPlayers.filter((player) => player.playerId !== playerId).map((player) => {
    const battingGap = Math.abs(player.runsPerAppearance - selected.runsPerAppearance);
    const bowlingGap = Math.abs(player.wicketsPerAppearance - selected.wicketsPerAppearance);
    const distance = similarityMode === "batting" ? battingGap : similarityMode === "bowling" ? bowlingGap : Math.hypot(battingGap / 10, bowlingGap);
    return { player, distance, battingGap, bowlingGap };
  }).sort((a, b) => a.distance - b.distance).slice(0, 5), [playerId, selected, similarityMode]);
  const coverageRows = Object.entries(archive.coverage.seasons).reverse();
  const latestCoverage = coverageRows[0];
  const latestBatting = latestCoverage ? Math.round(latestCoverage[1].battingBallsAvailable * 100 / Math.max(1, latestCoverage[1].battingInnings)) : 0;
  const latestBowling = latestCoverage ? Math.round(latestCoverage[1].bowlingBallsAvailable * 100 / Math.max(1, latestCoverage[1].bowlingSpells)) : 0;
  const copy = sectionCopy[section];
  const bestRows = archive.personalBests[bestMode];
  const progressionRows = archive.recordProgression[progressionMode];

  return <>
    <SiteHeader active="insights"/>
    <main className="portal-page records-lab-page">
      <header className="portal-page-heading records-lab-heading"><p className="eyebrow">Advanced records</p><h1>Records laboratory</h1><p>Explore exceptional performances, comparable careers and the records that shaped the Vault.</p></header>
      <nav className="records-lab-tabs" aria-label="Records Laboratory sections">{(Object.keys(sectionCopy) as Section[]).map((key) => <button type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)} key={key}>{key === "similarity" ? "Player similarity" : key === "bests" ? "Personal bests" : key === "progression" ? "Record progression" : "Data coverage"}</button>)}</nav>
      <section className="milestone-section records-lab-workspace">
        <header><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p>{copy.description}</p></header>

        {section === "similarity" && selected && <div className="lab-similarity">
          <div className="lab-filter-row"><label><span>Player</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{archive.similarityPlayers.map((player) => <option value={player.playerId} key={player.playerId}>{player.name}</option>)}</select></label><div className="lab-segmented" role="group" aria-label="Similarity type">{(["batting", "bowling", "allround"] as SimilarityMode[]).map((mode) => <button type="button" className={similarityMode === mode ? "active" : ""} onClick={() => setSimilarityMode(mode)} key={mode}>{mode === "allround" ? "All-round" : mode[0].toUpperCase() + mode.slice(1)}</button>)}</div></div>
          <aside className="lab-takeaway"><span>Closest match</span><strong>{similar[0]?.player.name ?? "—"}</strong><p>Based on career output per appearance among active players with at least 20 appearances.</p></aside>
          <div className="similarity-results">{similar.map(({ player, battingGap, bowlingGap }, index) => <article key={player.playerId}><b>{index + 1}</b><div><a href={`${publicBasePath}/players/${player.playerId}/`}>{player.name}</a><span>{integer.format(player.appearances)} appearances</span></div><dl><div><dt>Runs/app</dt><dd>{player.runsPerAppearance}</dd></div><div><dt>Wickets/app</dt><dd>{player.wicketsPerAppearance}</dd></div></dl><small>{battingGap.toFixed(2)} runs/app and {bowlingGap.toFixed(2)} wickets/app from {selected.name}</small></article>)}</div>
        </div>}

        {section === "bests" && <div className="lab-bests"><div className="lab-segmented lab-wide-tabs" role="group" aria-label="Performance ranking">{(["battingStrikeRate", "bowlingEconomy", "bowlingStrikeRate"] as BestMode[]).map((mode) => <button type="button" className={bestMode === mode ? "active" : ""} onClick={() => { setBestMode(mode); setBestLimit(5); }} key={mode}>{mode === "battingStrikeRate" ? "Batting strike rate" : mode === "bowlingEconomy" ? "Bowling economy" : "Bowling strike rate"}</button>)}</div><p className="lab-qualification">{bestMode === "battingStrikeRate" ? "Minimum 20 balls faced" : bestMode === "bowlingEconomy" ? "Minimum 3 overs bowled" : "Minimum 2 wickets"}</p><ol className="lab-ranked-list">{bestRows.slice(0, bestLimit).map((row, index) => <li key={`${row.fixtureId}-${row.player}`}><b>{index + 1}</b><div><strong>{row.player}</strong><span>{row.team} · {formatDate(row.date)}</span></div><em>{formatBestValue(row, bestMode)}</em><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>View match →</a></li>)}</ol>{bestLimit < bestRows.length && <button className="lab-show-more" type="button" onClick={() => setBestLimit((value) => value + 5)}>Show 5 more ↓</button>}</div>}

        {section === "progression" && <div className="lab-progression"><div className="lab-segmented" role="group" aria-label="Record type"><button type="button" className={progressionMode === "highestScore" ? "active" : ""} onClick={() => setProgressionMode("highestScore")}>Highest score</button><button type="button" className={progressionMode === "bestBowling" ? "active" : ""} onClick={() => setProgressionMode("bestBowling")}>Best bowling</button></div><aside className="lab-takeaway"><span>Current archive benchmark</span><strong>{progressionRows.at(-1) ? `${progressionRows.at(-1)!.player} · ${formatProgressionValue(progressionRows.at(-1)!)}` : "—"}</strong></aside><ol className="record-timeline">{progressionRows.map((row) => <li key={`${row.fixtureId}-${row.player}`}><time>{formatDate(row.date)}</time><i/><div><strong>{row.player}</strong><span>{formatProgressionValue(row)}</span><small>{row.team} v {row.opposition}</small></div><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>Match →</a></li>)}</ol></div>}

        {section === "coverage" && latestCoverage && <div className="lab-coverage"><div className="coverage-headlines"><article><span>{latestCoverage[0]} batting-ball coverage</span><strong>{latestBatting}%</strong></article><article><span>{latestCoverage[0]} complete bowling coverage</span><strong>{latestBowling}%</strong></article><article><span>Matches represented</span><strong>{integer.format(latestCoverage[1].matches)}</strong></article></div><p className="lab-coverage-note">Coverage describes the detail available for deeper analysis; it does not measure the completeness of career totals.</p><div className="coverage-season-list">{coverageRows.slice(0, coverageLimit).map(([season, row]) => { const batting = Math.round(row.battingBallsAvailable * 100 / Math.max(1, row.battingInnings)); const bowling = Math.round(row.bowlingBallsAvailable * 100 / Math.max(1, row.bowlingSpells)); return <article key={season}><strong>{season}</strong><div><span>Batting balls <b>{batting}%</b></span><i><u style={{width:`${batting}%`}}/></i></div><div><span>Bowling spells <b>{bowling}%</b></span><i><u style={{width:`${bowling}%`}}/></i></div></article>; })}</div>{coverageLimit < coverageRows.length && <button className="lab-show-more" type="button" onClick={() => setCoverageLimit((value) => value + 8)}>Show earlier seasons ↓</button>}</div>}
      </section>
    </main>
  </>;
}
