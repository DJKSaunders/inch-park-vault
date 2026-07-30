import type { Metadata } from "next";
import { MatchesExplorer } from "./matches-explorer";

export const metadata: Metadata = {
  title: "Match archive",
  description:
    "Explore Edinburgh South Cricket Club scorecards and results from 2004 onwards.",
};

export default function MatchesPage() {
  return <MatchesExplorer />;
}
