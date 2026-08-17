"use client";

import { useState } from "react";
import { displayOpponent } from "../opponents";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Recent = { metric: string; label: string; player: string; playerId: string; milestone: number; date: string; team: string | null; opposition: string | null; fixtureId: string | null };
type Upcoming = { metric: string; label: string; player: string; playerId: string; current: number; milestone: number; remaining: number };

export function MilestoneSection({ section }: { section: { key: string; title: string; recent: Recent[]; upcoming: Upcoming[] } }) {
  const [limit, setLimit] = useState(5);
  return <section className="milestone-section">
    <header><p className="eyebrow">Career landmarks</p><h2>{section.title}</h2></header>
    <div className="milestone-columns">
      <div><h3>Recently reached</h3><div className="milestone-list milestone-recent-list">
        {section.recent.slice(0, limit).map((item) => <article key={`${item.metric}-${item.playerId}-${item.milestone}`}><strong>{integer.format(item.milestone)}</strong><div><a href={`${publicBasePath}/players/${item.playerId}/`}>{item.player}</a><span>{item.label}</span>{item.fixtureId ? <a href={`${publicBasePath}/matches/${item.fixtureId}/`}>{shortDate.format(new Date(`${item.date}T12:00:00`))} · {item.team} v {displayOpponent(item.opposition)}</a> : <small>{shortDate.format(new Date(`${item.date}T12:00:00`))} · {item.team} v {displayOpponent(item.opposition)}</small>}</div></article>)}
      </div></div>
      <div><h3>Coming up</h3><div className="milestone-list milestone-upcoming-list">
        {section.upcoming.slice(0, limit).map((item) => { const progress = Math.max(0, Math.min(100, (item.current / item.milestone) * 100)); return <article key={`${item.metric}-${item.playerId}`}><div><a href={`${publicBasePath}/players/${item.playerId}/`}>{item.player}</a><span>{integer.format(item.current)} / {integer.format(item.milestone)} {item.label}</span></div><strong>{integer.format(item.remaining)} to go</strong><div className="milestone-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div></article>; })}
      </div></div>
    </div>
    {limit < Math.max(section.recent.length, section.upcoming.length) && <button className="milestone-show-more" type="button" onClick={() => setLimit((current) => current + 5)}>Show more</button>}
  </section>;
}
