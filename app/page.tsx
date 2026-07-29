import type { Metadata } from "next";
import matchIndex from "../public/data/scorecards/index.json";
import playerDirectory from "../public/data/scorecards/player-directory.json";
import records from "../public/data/records.json";
import { AdaptiveHome } from "./adaptive-home";

export const metadata: Metadata = {
  title: {
    absolute: "The Inch Park Vault",
  },
  description:
    "Edinburgh South Cricket Club Performance Archive – 2004–2026",
};

export default function Home() {
  const latestMatches = [...matchIndex.matches]
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.fixtureId.localeCompare(left.fixtureId),
    )
    .slice(0, 4)
    .map((match) => ({
      fixtureId: match.fixtureId,
      date: match.date,
      team: match.esccTeam,
      opposition: match.opposition,
      result: match.result,
    }));

  return (
    <AdaptiveHome
      summary={{
        seasons: records.meta.seasonCount,
        players: playerDirectory.playerCount,
        performances: records.meta.recordCount,
        matches: matchIndex.meta.matchCount,
        seasonStart: records.meta.seasonStart,
        seasonEnd: records.meta.seasonEnd,
      }}
      latestMatches={latestMatches}
    />
  );
}
