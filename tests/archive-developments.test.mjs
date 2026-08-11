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

test("Records Laboratory explains the question answered by each section", async () => {
  const source = await readFile(new URL("app/insights/records/records-lab.tsx", root), "utf8");
  assert.match(source, /Find similar players/);
  assert.match(source, /Best team performances/);
  assert.match(source, /How records evolved/);
  assert.match(source, /Data coverage/);
  assert.match(source, /Current archive benchmark/);
  assert.doesNotMatch(source, /bowling-spell coverage/i);
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
