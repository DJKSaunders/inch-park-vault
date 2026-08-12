import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("streak leaderboards expose five ranked players", async () => {
  const archive = JSON.parse(await readFile(new URL("public/data/archive-developments.json", root), "utf8"));
  for (const group of [archive.streaks.batting, archive.streaks.bowling]) {
    for (const rows of Object.values(group)) assert.ok(rows.length >= 5);
  }
});

test("Insights archive reports explain the question answered by each section", async () => {
  const source = await readFile(new URL("app/insights/records/records-lab.tsx", root), "utf8");
  assert.match(source, /Best performances by XI/);
  assert.match(source, /How records evolved/);
  assert.match(source, /Data coverage/);
  assert.match(source, /Current archive benchmark/);
  assert.doesNotMatch(source, /bowling-spell coverage/i);
});

test("Insights uses a two-level tab hierarchy", async () => {
  const [navigation, insights, records, styles] = await Promise.all([
    readFile(new URL("../app/insights/insights-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/insights-explorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/records/records-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const label of ["Club", "Players", "Teams & seasons", "Archive"]) {
    assert.match(navigation, new RegExp(label.replace("&", "&"), "i"));
  }
  assert.match(insights, /InsightsNavigation/);
  assert.match(records, /InsightsNavigation/);
  assert.doesNotMatch(records, /Records laboratory<\/h1>/i);
  assert.match(styles, /\.insights-secondary-tabs\.count-3[\s\S]*repeat\(3, 1fr\)/);
  assert.match(styles, /\.insights-primary-tabs[\s\S]*repeat\(4, 1fr\)/);
  assert.doesNotMatch(navigation, /Similar players/i);
  assert.doesNotMatch(navigation, /\/insights\/#/);
});

test("Insights reports retain their existing content", async () => {
  const [explorer, records, summary, generatedSections] = await Promise.all([
    readFile(new URL("../app/insights/insights-explorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/records/records-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/archive-summary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/records/[section]/page.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["Season trend", "Results", "Opposition", "How South wickets fell by season", "Player v player"]) {
    assert.match(explorer, new RegExp(label, "i"));
  }
  for (const label of ["Best performances by XI", "How records evolved", "Data coverage"]) {
    assert.match(records, new RegExp(label, "i"));
  }
  for (const label of ["Team histories", "Season overview", "Leading run-scorers", "Leading wicket-takers"]) {
    assert.match(summary, new RegExp(label, "i"));
  }
  assert.doesNotMatch(generatedSections, /similarity/);
});

test("Club Insights uses anchored sections and XI performances include team records", async () => {
  const [navigation, explorer, records, archive] = await Promise.all([
    readFile(new URL("../app/insights/insights-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/insights-explorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/records/records-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/data/archive-developments.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  for (const anchor of ["#overview", "#club-trends", "#dismissals"]) assert.match(navigation, new RegExp(anchor));
  for (const id of ["overview", "club-trends", "dismissals"]) assert.match(explorer, new RegExp(`id="${id}"`));
  assert.match(records, /performance-table-columns/);
  assert.match(records, /Team records/);
  for (const team of Object.values(archive.teamPerformances)) {
    for (const key of ["highestTotal", "lowestTotal", "largestWinRuns", "largestWinWickets"]) assert.ok(key in team.team);
  }
});

test("Records Laboratory data supports team rankings and transparent roles", async () => {
  const archive = JSON.parse(await readFile(new URL("public/data/archive-developments.json", root), "utf8"));
  assert.deepEqual(Object.keys(archive.teamPerformances), ["1st XI", "2nd XI", "3rd XI", "4th XI", "5th XI", "Mitres", "Women's"]);
  for (const team of Object.values(archive.teamPerformances)) {
    assert.ok(team.batting.length >= 10);
    assert.ok(team.bowling.length >= 10);
  }
  const roles = new Set(archive.similarityPlayers.map((player) => player.role));
  assert.deepEqual([...roles].sort(), ["allrounder", "batter", "bowler"]);
  assert.ok(archive.similarityPlayers.every((player) => player.battingAverage !== undefined && player.bowlingAverage !== undefined));
});

test("Match Archive search has an explicit, clearable submit flow", async () => {
  const source = await readFile(new URL("app/matches/matches-explorer.tsx", root), "utf8");
  assert.match(source, /onSubmit=\{submitSearch\}/);
  assert.match(source, /type="submit">Search/);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /function clearSearch\(\)/);
  assert.match(source, /matching \{matches\.length === 1 \? "scorecard" : "scorecards"\}/);
});

test("Google Analytics uses a persistent tag and tracks client navigation", async () => {
  const source = await readFile(new URL("app/google-analytics.tsx", root), "utf8");
  assert.match(source, /googletagmanager\.com\/gtag\/js/);
  assert.match(source, /window\.dataLayer = window\.dataLayer \|\| \[\]/);
  assert.match(source, /window\.gtag = gtag/);
  assert.match(source, /usePathname\(\)/);
  assert.match(source, /initialPage\.current/);
  assert.match(source, /"event", "page_view"/);
});
