import type { Metadata } from "next";
import { RecordsLab } from "../../records/records-lab";

export const metadata: Metadata = { title: "Record progression | Insights" };

export default function RecordProgressionPage() {
  return <RecordsLab initialSection="progression" />;
}
