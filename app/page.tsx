import type { Metadata } from "next";
import { RecordsExplorer } from "./records-explorer";

export const metadata: Metadata = {
  title: "Club Records",
  description:
    "Explore Edinburgh South Cricket Club player records, rankings and season-by-season performances from 2004 to 2025.",
};

export default function Home() {
  return <RecordsExplorer />;
}
