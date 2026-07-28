import type { Metadata } from "next";
import "./globals.css";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://records.edinburghsouthcc.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "The Inch Park Vault",
    template: "%s | The Inch Park Vault",
  },
  description:
    "Edinburgh South Cricket Club Performance Archive – 2004–2025",
  icons: {
    icon: `${publicBasePath}/escc-logo.png`,
    shortcut: `${publicBasePath}/escc-logo.png`,
  },
  openGraph: {
    title: "The Inch Park Vault",
    description:
      "Edinburgh South Cricket Club Performance Archive – 2004–2025",
    type: "website",
    images: [
      {
        url: `${publicBasePath}/og-vault.png`,
        width: 1729,
        height: 910,
        alt: "The Inch Park Vault — Edinburgh South Cricket Club Performance Archive, 2004–2025",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Inch Park Vault",
    description:
      "Edinburgh South Cricket Club Performance Archive – 2004–2025",
    images: [`${publicBasePath}/og-vault.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
