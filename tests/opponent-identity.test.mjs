import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Edinburgh University Staff remains distinct from Edinburgh University", async () => {
  const source = await readFile(new URL("../app/opponents.ts", import.meta.url), "utf8");
  const staff = source.indexOf('"Edinburgh University Staff"');
  const university = source.indexOf('"Edinburgh University"');
  assert.ok(staff >= 0);
  assert.ok(university >= 0);
  assert.ok(staff < university, "Staff-specific alias must take priority");
});

test("player profiles open the dedicated comparison route with the player selected", async () => {
  const source = await readFile(new URL("../app/players/[playerId]/player-profile.tsx", import.meta.url), "utf8");
  assert.match(source, /insights\/players\/compare\/\?player=\$\{player\.playerId\}/);
});
