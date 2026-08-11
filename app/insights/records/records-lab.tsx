"use client";

import { useState } from "react";
import archive from "../../../public/data/archive-developments.json";
import { SiteHeader } from "../../site-header";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
type Section = "similarity" | "performances" | "progression" | "coverage";
type Role = "batter" | "bowler" | "allrounder";
type Discipline = "batting" | "bowling";
type ProgressionMode = "highestScore" | "bestBowling";
type Team = keyof typeof archive.teamPerformances;

const sectionCopy: Record<Section, { eyebrow: string; title: string; description: string }> = {
  similarity: { eyebrow: "Comparable careers", title: "Find similar players", description: "Compare active players with the closest qualified batting and bowling averages." },
  performances: { eyebrow: "Team record books", title: "Best team performances", description: "The highest individual scores and best bowling figures recorded for each Edinburgh South team." },
  progression: { eyebrow: "Changing benchmarks", title: "How records evolved", description: "Follow every occasion on which a player raised the archive’s highest score or best-bowling benchmark." },
  coverage: { eyebrow: "Confidence in the archive", title: "Data coverage", description: "See which seasons contain the detail needed for strike rates, boundary analysis and fielding summaries." },
};
const sectionOrder: Section[] = ["performances", "progression", "similarity", "coverage"];

const roleLabels: Record<Role, string> = { batter: "Batters", bowler: "Bowlers", allrounder: "All-rounders" };
const roleRules: Record<Role, string> = {
  batter: "20+ innings and a batting average of 18 or higher",
  bowler: "20+ wickets and a bowling average of 30 or lower",
  allrounder: "20+ innings, 20+ wickets, batting average 15+ and bowling average 30 or lower",
};

function formatDate(value: string) { return dateLabel.format(new Date(`${value}T12:00:00`)); }
function formatProgressionValue(row: { runs: number; wickets?: number; notOut?: boolean }) { return row.wickets === undefined ? `${row.runs}${row.notOut ? "*" : ""}` : `${row.wickets}/${row.runs}`; }
function average(value: number | null) { return value === null ? "—" : value.toFixed(2); }

export function RecordsLab() {
  const teams = Object.keys(archive.teamPerformances) as Team[];
  const [section, setSection] = useState<Section>("similarity");
  const [role, setRole] = useState<Role>("allrounder");
  const initialPlayer = archive.similarityPlayers.find((player) => player.role === "allrounder")?.playerId ?? "";
  const [playerId, setPlayerId] = useState(initialPlayer);
  const [performanceTeam, setPerformanceTeam] = useState<Team>(teams[0]);
  const [discipline, setDiscipline] = useState<Discipline>("batting");
  const [performanceLimit, setPerformanceLimit] = useState(10);
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("highestScore");
  const playersForRole = archive.similarityPlayers.filter((player) => player.role === role);
  const selected = playersForRole.find((player) => player.playerId === playerId) ?? playersForRole[0];
  const similar = (() => {
    if (!selected) return [];
    return archive.similarityPlayers.filter((player) => player.role === role && player.playerId !== selected.playerId).map((player) => {
      const battingGap = Math.abs((player.battingAverage ?? 0) - (selected.battingAverage ?? 0));
      const bowlingGap = Math.abs((player.bowlingAverage ?? 0) - (selected.bowlingAverage ?? 0));
      const distance = role === "batter" ? battingGap : role === "bowler" ? bowlingGap : Math.hypot(battingGap / Math.max(1, selected.battingAverage ?? 1), bowlingGap / Math.max(1, selected.bowlingAverage ?? 1));
      return { player, distance };
    }).sort((left, right) => left.distance - right.distance).slice(0, 5);
  })();
  const performanceRows = archive.teamPerformances[performanceTeam][discipline];
  const progressionRows = archive.recordProgression[progressionMode];
  const coverageRows = Object.entries(archive.coverage.seasons).reverse();
  const copy = sectionCopy[section];

  function chooseRole(next: Role) {
    setRole(next);
    setPlayerId(archive.similarityPlayers.find((player) => player.role === next)?.playerId ?? "");
  }

  return <>
    <SiteHeader active="insights"/>
    <main className="portal-page records-lab-page">
      <header className="portal-page-heading records-lab-heading"><p className="eyebrow">Advanced records</p><h1>Records laboratory</h1><p>Explore exceptional performances, comparable careers and the records that shaped the Vault.</p></header>
      <section className="records-lab-shell">
        <nav className="records-lab-tabs" aria-label="Records Laboratory sections">{sectionOrder.map((key) => <button type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)} key={key}>{key === "similarity" ? "Similar players" : key === "performances" ? "Team performances" : key === "progression" ? "Record progression" : "Data coverage"}</button>)}</nav>
        <div className="records-lab-workspace">
        <header className="records-lab-toolbar"><div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2></div><p>{copy.description}</p></header>

        {section === "similarity" && selected && <div className="lab-similarity">
          <div className="lab-segmented lab-wide-tabs" role="group" aria-label="Player role">{(["batter", "bowler", "allrounder"] as Role[]).map((item) => <button type="button" className={role === item ? "active" : ""} onClick={() => chooseRole(item)} key={item}>{roleLabels[item]}</button>)}</div>
          <div className="similarity-query"><h3>Players similar to</h3><label><span>Select player</span><select value={selected.playerId} onChange={(event) => setPlayerId(event.target.value)}>{playersForRole.map((player) => <option value={player.playerId} key={player.playerId}>{player.name}</option>)}</select></label></div>
          <div className={`similarity-benchmark role-${role}`} aria-label={`${selected.name} career benchmark`}>
            <div><span>Appearances</span><strong>{integer.format(selected.appearances)}</strong></div>
            {role !== "bowler" && <><div><span>Innings</span><strong>{integer.format(selected.innings)}</strong></div><div><span>Runs</span><strong>{integer.format(selected.runs)}</strong></div><div><span>Bat avg</span><strong>{average(selected.battingAverage)}</strong></div></>}
            {role !== "batter" && <><div><span>Wickets</span><strong>{integer.format(selected.wickets)}</strong></div>{role === "bowler" && <div><span>Runs conceded</span><strong>{integer.format(selected.bowlingRuns)}</strong></div>}<div><span>Bowl avg</span><strong>{average(selected.bowlingAverage)}</strong></div></>}
          </div>
          <div className="similarity-results-heading"><h3>Closest career matches</h3><span>{role === "batter" ? "Ranked by batting average" : role === "bowler" ? "Ranked by bowling average" : "Ranked using both career averages"}</span></div>
          <div className="similarity-table-wrap"><table className={`similarity-table role-${role}`}><thead><tr><th>Rank</th><th>Player</th><th>Apps</th>{role !== "bowler" && <><th>Inns</th><th>Runs</th><th>Bat avg</th></>}{role !== "batter" && <><th>Wkts</th>{role === "bowler" && <th>Runs conceded</th>}<th>Bowl avg</th></>}</tr></thead><tbody>{similar.map(({ player }, index) => <tr key={player.playerId}><td>{index + 1}</td><th scope="row"><a href={`${publicBasePath}/players/${player.playerId}/`}>{player.name}</a><small>View player profile →</small></th><td>{integer.format(player.appearances)}</td>{role !== "bowler" && <><td>{integer.format(player.innings)}</td><td>{integer.format(player.runs)}</td><td>{average(player.battingAverage)}</td></>}{role !== "batter" && <><td>{integer.format(player.wickets)}</td>{role === "bowler" && <td>{integer.format(player.bowlingRuns)}</td>}<td>{average(player.bowlingAverage)}</td></>}</tr>)}</tbody></table></div>
          <p className="lab-role-rule"><strong>{roleLabels[role]}</strong> are defined as {roleRules[role]}. Similarity is based on {role === "batter" ? "batting average" : role === "bowler" ? "bowling average" : "the proportional difference in both averages"}.</p>
        </div>}

        {section === "performances" && <div className="lab-team-performances">
          <div className="performance-team-tabs" role="tablist" aria-label="Edinburgh South team">{teams.map((team) => <button type="button" role="tab" aria-selected={performanceTeam === team} className={performanceTeam === team ? "active" : ""} onClick={() => { setPerformanceTeam(team); setPerformanceLimit(10); }} key={team}>{team}</button>)}</div>
          <label className="performance-team-select"><span>Team</span><select value={performanceTeam} onChange={(event) => { setPerformanceTeam(event.target.value as Team); setPerformanceLimit(10); }}>{teams.map((team) => <option key={team}>{team}</option>)}</select></label>
          <div className="lab-segmented performance-discipline" role="group" aria-label="Performance type"><button type="button" className={discipline === "batting" ? "active" : ""} onClick={() => { setDiscipline("batting"); setPerformanceLimit(10); }}>Batting</button><button type="button" className={discipline === "bowling" ? "active" : ""} onClick={() => { setDiscipline("bowling"); setPerformanceLimit(10); }}>Bowling</button></div>
          <ol className="lab-ranked-list performance-list">{performanceRows.slice(0, performanceLimit).map((row, index) => <li key={`${row.fixtureId}-${row.player}`}><b>{index + 1}</b><div><strong>{row.player}</strong><span>{formatDate(row.date)} · v {row.opposition}</span></div><em>{discipline === "batting" && "notOut" in row ? `${row.runs}${row.notOut ? "*" : ""}` : `${"wickets" in row ? row.wickets : 0}/${row.runs}`}</em><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>View match →</a></li>)}</ol>
          {performanceLimit < performanceRows.length && <button className="lab-show-more" type="button" onClick={() => setPerformanceLimit((value) => value + 10)}>Show 10 more ↓</button>}
        </div>}

        {section === "progression" && <div className="lab-progression"><div className="lab-segmented" role="group" aria-label="Record type"><button type="button" className={progressionMode === "highestScore" ? "active" : ""} onClick={() => setProgressionMode("highestScore")}>Highest score</button><button type="button" className={progressionMode === "bestBowling" ? "active" : ""} onClick={() => setProgressionMode("bestBowling")}>Best bowling</button></div><aside className="lab-takeaway"><span>Current archive benchmark</span><strong>{progressionRows.at(-1) ? `${progressionRows.at(-1)!.player} · ${formatProgressionValue(progressionRows.at(-1)!)}` : "—"}</strong></aside><ol className="record-timeline">{progressionRows.map((row) => <li key={`${row.fixtureId}-${row.player}`}><time>{formatDate(row.date)}</time><i/><div><strong>{row.player}</strong><span>{formatProgressionValue(row)}</span><small>{row.team} v {row.opposition}</small></div><a href={`${publicBasePath}/matches/${row.fixtureId}/`}>Match →</a></li>)}</ol></div>}

        {section === "coverage" && <div className="lab-coverage"><div className="coverage-legend"><p><strong>Balls faced</strong> enables batting strike-rate analysis.</p><p><strong>Boundaries</strong> enables fours, sixes and boundary-percentage analysis.</p><p><strong>Fielding detail</strong> supports catches, stumpings and run-out analysis.</p></div><div className="coverage-season-list expanded"><header><span>Season</span><span>Matches</span><span>Balls faced</span><span>Boundaries</span><span>Fielding detail</span></header>{coverageRows.map(([season, row]) => { const batting = Math.round(row.battingBallsAvailable * 100 / Math.max(1, row.battingInnings)); const boundaries = Math.round(row.boundariesAvailable * 100 / Math.max(1, row.battingInnings)); const fielding = Math.round(row.fieldingAvailable * 100 / Math.max(1, row.battingInnings)); return <article key={season}><strong>{season}</strong><b>{integer.format(row.matches)}</b><div><span>{integer.format(row.battingBallsAvailable)} / {integer.format(row.battingInnings)} <b>{batting}%</b></span><i><u style={{width:`${batting}%`}}/></i></div><div><span><b>{boundaries}%</b></span><i><u style={{width:`${boundaries}%`}}/></i></div><div><span><b>{fielding}%</b></span><i><u style={{width:`${fielding}%`}}/></i></div></article>; })}</div></div>}
        </div>
      </section>
    </main>
  </>;
}
