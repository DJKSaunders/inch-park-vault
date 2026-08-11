import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("team and season leaderboards use progressive disclosure", async () => {
  const source = await readFile(new URL("../app/insights/archive-summary.tsx", import.meta.url), "utf8");
  assert.match(source, /Show \{Math\.min\(10,/);
  assert.match(source, /Collapse ↑/);
  assert.match(source, /Showing \{Math\.min/);
  assert.doesNotMatch(source, /Run-scorers shown|Wicket-takers shown/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /archive-team-select/);
});
