import type { Metadata } from "next";
import { InsightsExplorer } from "../../insights-explorer";

export const metadata: Metadata = { title: "Player comparison | Insights" };

export default function PlayerComparisonPage() {
  return <InsightsExplorer report="compare" />;
}
