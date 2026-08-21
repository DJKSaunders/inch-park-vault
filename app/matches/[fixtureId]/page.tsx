import type { Metadata } from "next";
import matchIndex from "../../../public/data/scorecards/index.json";
import { displayFixtureOpponent } from "../../opponents";
import { MatchScorecard } from "./scorecard";

type MatchPageProps = {
  params: Promise<{ fixtureId: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return matchIndex.matches.map((match) => ({
    fixtureId: match.fixtureId,
  }));
}

export async function generateMetadata({
  params,
}: MatchPageProps): Promise<Metadata> {
  const { fixtureId } = await params;
  const match = matchIndex.matches.find((item) => item.fixtureId === fixtureId);
  return {
    title: match
      ? `${match.esccTeam ?? "ESCC"} v ${displayFixtureOpponent(match.opposition, match)}`
      : "Match scorecard",
    description: match?.result ?? "Edinburgh South Cricket Club match scorecard.",
  };
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { fixtureId } = await params;
  return <MatchScorecard fixtureId={fixtureId} />;
}
