import type { Metadata } from "next";
import { RecordsExplorer } from "./records-explorer";

export const metadata: Metadata = {
  title: {
    absolute: "The Inch Park Vault",
  },
  description:
    "Edinburgh South Cricket Club Performance Archive – 2004–2025",
};

export default function Home() {
  return <RecordsExplorer />;
}
