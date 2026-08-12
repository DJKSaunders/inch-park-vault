"use client";

import { useState } from "react";
import archive from "../../../public/data/archive-developments.json";
import { SiteHeader } from "../../site-header";
import { InsightsNavigation, type InsightsGroup, type InsightsSubsection } from "../insights-navigation";
import { InsightsPageHeader } from "../insights-page-header";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
type Section = "performances" | "progression" | "coverage";
type ProgressionMode = "highestScore" | "bestBowling";
type Team = keyof typeof archive.teamPerformances;

const sectionCopy: Record<Section, { eyebrow: string; title: string; description: string }> = {
  performances: { eyebrow: "Team record books", title: "Best performances by XI", description: "The leading individual performances and team records for each Edinburgh South XI." },
  progression: { eyebrow: "Changing benchmarks", title: "How records evolved", description: "Follow every occasion on which a player raised the archive’s highest score or best-bowling benchmark." },
  coverage: { eyebrow: "Confidence in the archive", title: "Data coverage", description: "See which seasons contain the detail needed for strike rates, boundary analysis and fielding summaries." },
};
function formatDate(value: string) { return dateLabel.format(new Date(`${value}T12:00:00`)); }
function formatProgressionValue(row: { runs: number; wickets?: number; notOut?: boolean }) { return row.wickets === undefined ? `${row.runs}${row.notOut ? "*" : ""}` : `${row.wickets}/${row.runs}`; }

export function RecordsLab({ initialSection = "progression" }: { initialSection?: Section }) {
  const teams = Object.keys(archive.teamPerformances) as Team[];
  const [section] = useState<Section>(initialSection);
  const [performanceTeam, setPerformanceTeam] = useState<Team>(teams[0]);
  const [battingLimit, setBattingLimit] = useState(10);
  const [bowlingLimit, setBowlingLimit] = useState(10);
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("highestScore");
  const performance = archive.teamPerformances[performanceTeam];
  const progressionRows = archive.recordProgression[progressionMode];
  const coverageRows = Object.entries(archive.coverage.seasons).reverse();
  const copy = sectionCopy[section];

  const navigation: { group: InsightsGroup; subsection: InsightsSubsection } =
    section === "performances"
        ? { group: "xis", subsection: "team-performances" }
        : section === "progression"
          ? { group: "archive", subsection: "record-progression" }
          : { group: "archive", subsection: "data-coverage" };
  return <>
    <SiteHeader active="insights"/>
    <main className="portal-page records-lab-page">
      <InsightsPageHeader />
      <InsightsNavigation activeGroup={navigation.group} activeSubsection={navigation.subsection}/>
      <section className="records-lab-shell">
        <div className="records-lab-workspace">
        <header className="records-lab-toolbar"><div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2></div><p>{copy.description}</p></header>

        {section === "performances" && <div className="lab-team-performances">
          <div className="performance-team-tabs" role="tablist" aria-label="Edinburgh South team">{teams.map((team) => <button type="button" role="tab" aria-selected={performanceTeam === team} className={performanceTeam === team ? "active" : ""} onClick={() => { setPerformanceTeam(team); setBattingLimit(10); setBowlingLimit(10); }} key={team}>{team}</button>)}</div>
          <label className="performance-team-select"><span>Team</span><select value={performanceTeam} onChange={(event) => { setPerformanceTeam(event.target.value as Team); setBattingLimit(10); setBowlingLimit(10); }}>{teams.map((team) => <option key={team}>{team}</option>)}</select></label>
          <div className="performance-table-columns">
            <section><h3>Batting</h3><ol className="lab-ranked-list performance-list">{performance.batting.slice(0, battingLimit).map((row, index) => <li key={`${row.fixtureId}-${row.player}`}><b>{index + 1}</b><div><strong>{row.player}</strong><span>{formatDate(row.date)} · v {row.opposition}</span></div><em>{`${row.runs}${row.notOut ? "*" : ""}`}</em><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>View match →</a></li>)}</ol>{battingLimit < performance.batting.length && <button className="lab-show-more" type="button" onClick={() => setBattingLimit((value) => value + 10)}>Show 10 more ↓</button>}</section>
            <section><h3>Bowling</h3><ol className="lab-ranked-list performance-list">{performance.bowling.slice(0, bowlingLimit).map((row, index) => <li key={`${row.fixtureId}-${row.player}`}><b>{index + 1}</b><div><strong>{row.player}</strong><span>{formatDate(row.date)} · v {row.opposition}</span></div><em>{`${row.wickets}/${row.runs}`}</em><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>View match →</a></li>)}</ol>{bowlingLimit < performance.bowling.length && <button className="lab-show-more" type="button" onClick={() => setBowlingLimit((value) => value + 10)}>Show 10 more ↓</button>}</section>
          </div>
          <section className="team-performance-records"><header><p className="eyebrow">Team records</p><h3>Team</h3></header><div>{([
            ["Highest total", performance.team.highestTotal, "runs"],
            ["Lowest total", performance.team.lowestTotal, "runs"],
            ["Largest win by runs", performance.team.largestWinRuns, "runs"],
          ] as const).map(([label, record, unit]) => record && <a href={`${publicBasePath}/matches/${record.fixtureId}/`} key={label}><span>{label}</span><strong>{record.value} {unit}</strong><small>{formatDate(record.date)} · v {record.opposition}</small></a>)}{performance.team.largestWinWickets.map((record) => <a href={`${publicBasePath}/matches/${record.fixtureId}/`} key={`wickets-${record.fixtureId}`}><span>Largest win by wickets</span><strong>{record.value} wickets</strong><small>{formatDate(record.date)} · v {record.opposition}</small></a>)}</div></section>
        </div>}

        {section === "progression" && <div className="lab-progression"><div className="lab-segmented" role="group" aria-label="Record type"><button type="button" className={progressionMode === "highestScore" ? "active" : ""} onClick={() => setProgressionMode("highestScore")}>Highest score</button><button type="button" className={progressionMode === "bestBowling" ? "active" : ""} onClick={() => setProgressionMode("bestBowling")}>Best bowling</button></div><aside className="lab-takeaway"><span>Current archive benchmark</span><strong>{progressionRows.at(-1) ? `${progressionRows.at(-1)!.player} · ${formatProgressionValue(progressionRows.at(-1)!)}` : "—"}</strong></aside><ol className="record-timeline">{progressionRows.map((row) => <li key={`${row.fixtureId}-${row.player}`}><time>{formatDate(row.date)}</time><i/><div><strong>{row.player}</strong><span>{formatProgressionValue(row)}</span><small>{row.team} v {row.opposition}</small></div><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>Match →</a></li>)}</ol></div>}

        {section === "coverage" && <div className="lab-coverage"><div className="coverage-legend"><p><strong>Balls faced</strong> enables batting strike-rate analysis.</p><p><strong>Boundaries</strong> enables fours, sixes and boundary-percentage analysis.</p><p><strong>Fielding detail</strong> supports catches, stumpings and run-out analysis.</p></div><div className="coverage-season-list expanded"><header><span>Season</span><span>Matches</span><span>Balls faced</span><span>Boundaries</span><span>Fielding detail</span></header>{coverageRows.map(([season, row]) => { const batting = Math.round(row.battingBallsAvailable * 100 / Math.max(1, row.battingInnings)); const boundaries = Math.round(row.boundariesAvailable * 100 / Math.max(1, row.battingInnings)); const fielding = Math.round(row.fieldingAvailable * 100 / Math.max(1, row.battingInnings)); return <article key={season}><strong>{season}</strong><b>{integer.format(row.matches)}</b><div><span>{integer.format(row.battingBallsAvailable)} / {integer.format(row.battingInnings)} <b>{batting}%</b></span><i><u style={{width:`${batting}%`}}/></i></div><div><span><b>{boundaries}%</b></span><i><u style={{width:`${boundaries}%`}}/></i></div><div><span><b>{fielding}%</b></span><i><u style={{width:`${fielding}%`}}/></i></div></article>; })}</div></div>}
        </div>
      </section>
    </main>
  </>;
}
