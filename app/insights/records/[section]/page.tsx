import type { Metadata } from "next";
import { RecordsLab } from "../records-lab";

const sections = ["performances", "progression", "coverage"] as const;
type Section = (typeof sections)[number];

export const dynamicParams = false;

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export const metadata: Metadata = { title: "Insights" };

export default async function InsightSectionPage({
  params,
}: {
  params: Promise<{ section: Section }>;
}) {
  const { section } = await params;
  return <RecordsLab initialSection={section} />;
}
