import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://records.edinburghsouthcc.org"),
  title: {
    default: "Edinburgh South CC Club Records",
    template: "%s | Edinburgh South CC",
  },
  description:
    "Explore more than two decades of Edinburgh South Cricket Club player records.",
  icons: {
    icon: "/escc-logo.png",
    shortcut: "/escc-logo.png",
  },
  openGraph: {
    title: "Edinburgh South CC Club Records",
    description:
      "Explore player rankings and season-by-season performances from 2004 to 2025.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Edinburgh South CC Club Records, 2004 to 2025",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Edinburgh South CC Club Records",
    description:
      "Explore player rankings and season-by-season performances from 2004 to 2025.",
    images: ["/og.png"],
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
