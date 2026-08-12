import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("cap-number export is continuous and excludes Women's fixtures", async () => {
  const source = JSON.parse(await read("data/cap-numbers-source.json"));
  const output = JSON.parse(await read("public/data/cap-numbers.json"));
  const register = [...source.existing, ...source.continuation].sort(
    (left, right) => left.capNumber - right.capNumber,
  );

  assert.equal(output.capCount, 499);
  assert.deepEqual(
    register.map((entry) => entry.capNumber),
    Array.from({ length: 499 }, (_, index) => index + 1),
  );
  assert.equal(
    source.continuation.some((entry) => entry.team === "Women's"),
    false,
  );
});

test("known players receive the audited cap number and preferred name", async () => {
  const output = JSON.parse(await read("public/data/cap-numbers.json"));

  assert.equal(output.byName.danielsaunders.capNumber, 335);
  assert.equal(output.byName.sriramgovindan.capNumber, 383);
  assert.equal(output.byName.srinim.capNumber, 484);
  assert.equal(output.byName.srinim.displayName, "Srini Muthuraman");
  assert.equal(output.byName.srinimuthuraman.capNumber, 484);
});

test("profile and records interfaces expose compact cap treatments", async () => {
  const [profile, records, directory, styles] = await Promise.all([
    read("app/players/[playerId]/player-profile.tsx"),
    read("app/records-explorer.tsx"),
    read("app/players/players-directory.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(profile, /profile-cap-number/);
  assert.match(profile, /Cap #/);
  assert.match(records, /Search player or cap number/);
  assert.match(records, /player-reference-name/);
  assert.match(directory, /Search by name or cap number/);
  assert.match(styles, /\.player-reference-name > small[\s\S]*font-size: 8px/);
});
