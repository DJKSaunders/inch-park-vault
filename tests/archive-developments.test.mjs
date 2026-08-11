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
  assert.match(source, /Best individual performances/);
  assert.match(source, /How records evolved/);
  assert.match(source, /Data coverage/);
  assert.match(source, /Current archive benchmark/);
});
