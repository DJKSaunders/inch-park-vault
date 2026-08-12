import type { Metadata } from "next";
import { RecordsLab } from "../../records/records-lab";

export const metadata: Metadata = { title: "Data coverage | Insights" };

export default function DataCoveragePage() {
  return <RecordsLab initialSection="coverage" />;
}
