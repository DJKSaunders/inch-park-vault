import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../app/vaultguru/vaultguru-explorer.tsx", import.meta.url);

test("advanced VaultGuru filters aggregate qualifying performances", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /for \(const row of battingPerformances\)/);
  assert.match(source, /for \(const row of bowlingPerformances\)/);
  assert.match(source, /performancePasses\(row, filters, contextMap\)/);
  assert.match(source, /stats\.matches\.add\(row\.fixtureId\)/);
});

test("VaultGuru multi-select menus close their siblings", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /\.vaultguru-multi\[open\]/);
  assert.match(source, /details\.removeAttribute\("open"\)/);
});

test("active advanced filters are removable", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /minimumRuns: 0/);
  assert.match(source, /minimumWickets: 0/);
  assert.match(source, /firstAction: "either"/);
});
