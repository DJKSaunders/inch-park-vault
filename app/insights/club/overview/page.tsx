import type { Metadata } from "next";
import { InsightsExplorer } from "../../insights-explorer";

export const metadata: Metadata = { title: "Club overview | Insights" };

export default function ClubOverviewPage() {
  return <InsightsExplorer report="overview" />;
}
