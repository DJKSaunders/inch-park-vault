import type { Metadata } from "next";
import milestones from "../../public/data/scorecards/milestones.json";
import { displayOpponent } from "../opponents";
import { SiteHeader } from "../site-header";
import { LongestStreaks } from "./archive-achievements";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const integer = new Intl.NumberFormat("en-GB");
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const metadata: Metadata = {
  title: "Milestones",
  description:
    "Recent Edinburgh South Cricket Club career milestones and the players approaching their next landmark.",
};

export default function MilestonesPage() {
  return (
    <>
      <SiteHeader active="milestones" />
      <main className="portal-page milestones-page">
        <header className="portal-page-heading milestones-heading">
          <p className="eyebrow">Club landmarks</p>
          <h1>Milestones</h1>
          <p>
            The latest career landmarks across the club, and the players who
            are closest to reaching the next one.
          </p>
          <span>Updated through {shortDate.format(new Date(`${milestones.asOfDate}T12:00:00`))}</span>
        </header>

        <div className="milestone-sections">
          {milestones.sections.map((section) => (
            <section className="milestone-section" key={section.key}>
              <header>
                <p className="eyebrow">Career landmarks</p>
                <h2>{section.title}</h2>
              </header>
              <div className="milestone-columns">
                <div>
                  <h3>Recently reached</h3>
                  <div className="milestone-list milestone-recent-list">
                    {section.recent.map((item) => (
                      <article key={`${item.metric}-${item.playerId}-${item.milestone}`}>
                        <strong>{integer.format(item.milestone)}</strong>
                        <div>
                          <a href={`${publicBasePath}/players/${item.playerId}/`}>
                            {item.player}
                          </a>
                          <span>{item.label}</span>
                          {item.fixtureId ? (
                            <a href={`${publicBasePath}/matches/${item.fixtureId}/`}>
                              {shortDate.format(new Date(`${item.date}T12:00:00`))} · {item.team} v {displayOpponent(item.opposition)}
                            </a>
                          ) : (
                            <small>
                              {shortDate.format(new Date(`${item.date}T12:00:00`))} · {item.team} v {displayOpponent(item.opposition)}
                            </small>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div>
                  <h3>Coming up</h3>
                  <div className="milestone-list milestone-upcoming-list">
                    {section.upcoming.map((item) => {
                      const progress = Math.max(
                        0,
                        Math.min(100, (item.current / item.milestone) * 100),
                      );
                      return (
                        <article key={`${item.metric}-${item.playerId}`}>
                          <div>
                            <a href={`${publicBasePath}/players/${item.playerId}/`}>
                              {item.player}
                            </a>
                            <span>
                              {integer.format(item.current)} / {integer.format(item.milestone)} {item.label}
                            </span>
                          </div>
                          <strong>{integer.format(item.remaining)} to go</strong>
                          <div className="milestone-progress" aria-hidden="true">
                            <i style={{ width: `${progress}%` }} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
        <div className="milestone-sections achievement-sections">
          <section className="milestone-section"><header><p className="eyebrow">Performance sequences</p><h2>Longest streaks</h2><p>The longest runs of qualifying performances, following only each player’s own appearances.</p></header><LongestStreaks /><p className="method-note">DNBs and matches without a bowling spell do not interrupt streaks. Concessions and abandonments neither extend nor break them. Streaks continue across seasons.</p></section>
        </div>
      </main>
    </>
  );
}
