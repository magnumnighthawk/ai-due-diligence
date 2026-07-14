import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diligence Radar — cross-workstream risk",
  description: "Cross-workstream risk radar over a surrogate SEC-filing deal room",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      {/* background/color/font-family are set once, in globals.css's `body {}`
          rule -- deliberately not duplicated here as utility classes, since a
          class selector (e.g. text-graphite-950) would win over that plain
          element-selector rule on specificity and become a second, higher-
          precedence source of truth for the same value. */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
