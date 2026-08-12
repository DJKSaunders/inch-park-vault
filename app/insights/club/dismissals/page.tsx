import type { Metadata } from "next";
import { InsightsExplorer } from "../../insights-explorer";

export const metadata: Metadata = { title: "Dismissals | Insights" };

export default function DismissalsPage() {
  return <InsightsExplorer report="dismissals" />;
}
