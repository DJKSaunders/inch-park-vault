import type { Metadata } from "next";
import directory from "../../../public/data/scorecards/player-directory.json";
import { PlayerProfile } from "./player-profile";

type PlayerPageProps = {
  params: Promise<{ playerId: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return directory.players.map((player) => ({
    playerId: player.playerId,
  }));
}

export async function generateMetadata({
  params,
}: PlayerPageProps): Promise<Metadata> {
  const { playerId } = await params;
  const player = directory.players.find((entry) => entry.playerId === playerId);
  return {
    title: player?.name ?? "Player profile",
    description: player
      ? `${player.name}'s Edinburgh South Cricket Club career profile and season charts.`
      : "Edinburgh South Cricket Club player profile.",
  };
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { playerId } = await params;
  const player = directory.players.find((entry) => entry.playerId === playerId);
  return <PlayerProfile player={player ?? null} />;
}
