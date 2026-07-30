import type { Metadata } from "next";
import { PlayersDirectory } from "./players-directory";

export const metadata: Metadata = {
  title: "Players",
  description:
    "Find Edinburgh South Cricket Club players and explore permanent career profiles.",
};

export default function PlayersPage() {
  return <PlayersDirectory />;
}
