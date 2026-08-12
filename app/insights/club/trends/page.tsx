import type { Metadata } from "next";
import { InsightsExplorer } from "../../insights-explorer";

export const metadata: Metadata = { title: "Club trends | Insights" };

export default function ClubTrendsPage() {
  return <InsightsExplorer report="club-trends" />;
}
