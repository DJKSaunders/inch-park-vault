import type { Metadata } from "next";
import { VaultGuruExplorer } from "./vaultguru-explorer";

export const metadata: Metadata = {
  title: "VaultGuru",
  description:
    "Advanced search and report building for the Edinburgh South Cricket Club archive.",
};

export default function VaultGuruPage() {
  return <VaultGuruExplorer />;
}
