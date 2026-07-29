import type { Metadata } from "next";
import { RecordsExplorer } from "../records-explorer";

export const metadata: Metadata = {
  title: "Records",
  description:
    "Explore Edinburgh South Cricket Club career records and individual performances.",
};

export default function RecordsPage() {
  return <RecordsExplorer />;
}
