import type { Metadata } from "next";
import { RecordsExplorer } from "./records-explorer";

export const metadata: Metadata = {
  title: {
    absolute: "The Inch Park Vault",
  },
  description:
    "The Edinburgh South Cricket Club performance archive.",
};

export default function Home() {
  return <RecordsExplorer />;
}
