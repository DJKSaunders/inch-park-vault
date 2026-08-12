import type { Metadata } from "next";
import { ArchiveSummary } from "../../archive-summary";

export const metadata: Metadata = { title: "Season overview | Insights" };

export default function SeasonReviewsPage() {
  return <ArchiveSummary mode="seasons" />;
}
