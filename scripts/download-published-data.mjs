import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceBase = process.env.PUBLISHED_DATA_BASE_URL ??
  "https://edinburgh-south-club-records.djksaunders.chatgpt.site/data";
const outputRoot = path.resolve("public/data");
const concurrency = 20;

async function download(relativePath, attempt = 1) {
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const response = await fetch(`${sourceBase}/${relativePath}`);
  if (!response.ok) {
    if (attempt < 3) return download(relativePath, attempt + 1);
    throw new Error(`Failed to download ${relativePath}: HTTP ${response.status}`);
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function downloadPool(paths) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
    while (cursor < paths.length) {
      const index = cursor++;
      await download(paths[index]);
    }
  });
  await Promise.all(workers);
}

const fixedFiles = [
  "records.json",
  "records-quality.json",
  "scorecards/appearances.json",
  "scorecards/batting-innings.json",
  "scorecards/bowling-spells.json",
  "scorecards/coverage.json",
  "scorecards/data-quality.json",
  "scorecards/index.json",
  "scorecards/player-directory.json",
  "scorecards/players/index.json",
  "scorecards/provenance.json",
  "scorecards/records-player-map.json",
  "scorecards/schema.json",
];

await downloadPool(fixedFiles);

const matchIndex = JSON.parse(
  await readFile(path.join(outputRoot, "scorecards/index.json"), "utf8"),
);
const playerIndex = JSON.parse(
  await readFile(path.join(outputRoot, "scorecards/players/index.json"), "utf8"),
);
const generatedFiles = [
  ...matchIndex.matches.map((match) => `scorecards/${match.path}`),
  ...playerIndex.players.map((player) => `scorecards/${player.path}`),
];

await downloadPool(generatedFiles);
console.log(`Downloaded ${fixedFiles.length + generatedFiles.length} published data files.`);
