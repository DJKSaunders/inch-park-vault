import type { Metadata } from "next";
import { RecordsLab } from "../../records/records-lab";

export const metadata: Metadata = { title: "Best performances by XI | Insights" };

export default function TeamPerformancesPage() {
  return <RecordsLab initialSection="performances" />;
}
