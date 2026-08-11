import type { Metadata } from "next";
import { ArchiveSummary } from "../archive-summary";
export const metadata: Metadata = { title: "Team histories" };
export default function TeamHistoriesPage() { return <ArchiveSummary mode="teams"/>; }
