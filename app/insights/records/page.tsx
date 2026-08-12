import type { Metadata } from "next";
import { RecordsLab } from "./records-lab";
export const metadata: Metadata = { title: "Archive insights" };
export default function RecordsLabPage(){ return <RecordsLab initialSection="progression"/>; }
