import type { Metadata } from "next";
import milestones from "../../public/data/scorecards/milestones.json";
import { SiteHeader } from "../site-header";
import { LongestStreaks } from "./archive-achievements";
import { MilestoneSection } from "./milestone-section";

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
            are closest to the next.
          </p>
          <span className="archive-as-of milestones-as-of">Stats as of&nbsp;<strong>{shortDate.format(new Date(`${milestones.asOfDate}T12:00:00`)).toUpperCase()}</strong></span>
        </header>

        <div className="milestone-sections">
          {milestones.sections.map((section) => <MilestoneSection key={section.key} section={section} />)}
        </div>
        <div className="milestone-sections achievement-sections">
          <section className="milestone-section"><header><p className="eyebrow">Performance sequences</p><h2>Longest streaks</h2><p>The longest runs of qualifying performances, following only each player’s own appearances.</p></header><LongestStreaks /><p className="method-note">DNBs and matches without a bowling spell do not interrupt streaks. Concessions and abandonments neither extend nor break them. Streaks continue across seasons.</p></section>
        </div>
      </main>
    </>
  );
}
