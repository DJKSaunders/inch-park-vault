import type { Metadata } from "next";
import { InsightsExplorer } from "./insights-explorer";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Explore Edinburgh South Cricket Club trends, team results and player comparisons.",
};

export default function InsightsPage() {
  return <InsightsExplorer />;
}
