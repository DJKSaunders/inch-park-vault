"use client";

import { useState } from "react";
import archive from "../../public/data/archive-developments.json";
import { SiteHeader } from "../site-header";

const integer = new Intl.NumberFormat("en-GB");
const limits = [10, 25, 50, 100];

export function ArchiveSummary({ mode }: { mode: "teams" | "seasons" }) {
  const options = mode === "teams" ? archive.teams : archive.seasons;
  const [selected, setSelected] = useState(0);
  const [runLimit, setRunLimit] = useState(10);
  const [wicketLimit, setWicketLimit] = useState(10);
  const item = options[selected];
  const label = mode === "teams" ? "team" in item ? item.team : "" : "season" in item ? String(item.season) : "";

  function selectView(index: number) {
    setSelected(index);
    setRunLimit(10);
    setWicketLimit(10);
  }

  return <main className="vault-app archive-summary-app">
    <SiteHeader active="insights"/>
    <section className="archive-summary-hero">
      <p className="eyebrow">Insights · {mode === "teams" ? "Team history" : "Season reviews"}</p>
      <h1>{mode === "teams" ? "Team histories" : "Season reviews"}</h1>
      <p>{mode === "teams" ? "Results and leading performers for each numbered Edinburgh South XI." : "Every season’s results, output and leading performers in one view."}</p>
    </section>
    <section className="insight-panel archive-summary-shell">
      <label><span>{mode === "teams" ? "Team" : "Season"}</span><select value={selected} onChange={(event) => selectView(Number(event.target.value))}>{options.map((option, index) => <option value={index} key={"team" in option ? option.team : option.season}>{"team" in option ? option.team : option.season}</option>)}</select></label>
      <header><p className="eyebrow">Selected view</p><h2>{label}</h2></header>
      <div className="archive-summary-stats"><div><span>Played</span><strong>{integer.format(item.played)}</strong></div><div><span>Won</span><strong>{integer.format(item.won)}</strong></div><div><span>Lost</span><strong>{integer.format(item.lost)}</strong></div><div><span>Win rate</span><strong>{item.winPercentage === null ? "—" : `${item.winPercentage}%`}</strong></div>{"runs" in item && <><div><span>Runs</span><strong>{integer.format(item.runs)}</strong></div><div><span>Wickets</span><strong>{integer.format(item.wickets)}</strong></div></>}</div>
      <div className="archive-leader-columns">
        <section><header><h3>Leading run-scorers</h3><label>Show <select aria-label="Run-scorers shown" value={runLimit} onChange={(event) => setRunLimit(Number(event.target.value))}>{limits.map((limit) => <option key={limit}>{limit}</option>)}</select></label></header>{item.runLeaders.slice(0, runLimit).map((leader, index) => <div key={leader.player}><span>{index + 1}. {leader.player}</span><strong>{integer.format(leader.value)}</strong></div>)}</section>
        <section><header><h3>Leading wicket-takers</h3><label>Show <select aria-label="Wicket-takers shown" value={wicketLimit} onChange={(event) => setWicketLimit(Number(event.target.value))}>{limits.map((limit) => <option key={limit}>{limit}</option>)}</select></label></header>{item.wicketLeaders.slice(0, wicketLimit).map((leader, index) => <div key={leader.player}><span>{index + 1}. {leader.player}</span><strong>{integer.format(leader.value)}</strong></div>)}</section>
      </div>
    </section>
  </main>;
}
