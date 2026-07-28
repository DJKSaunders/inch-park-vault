import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://records.edinburghsouthcc.org"),
  title: {
    default: "The Inch Park Vault",
    template: "%s | The Inch Park Vault",
  },
  description:
    "Edinburgh South Cricket Club Performance Archive – 2004–2025",
  icons: {
    icon: "/escc-logo.png",
    shortcut: "/escc-logo.png",
  },
  openGraph: {
    title: "The Inch Park Vault",
    description:
      "Edinburgh South Cricket Club Performance Archive – 2004–2025",
    type: "website",
    images: [
      {
        url: "/og-vault.png",
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
    images: ["/og-vault.png"],
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
