import type { Metadata } from "next";
import "./globals.css";
import { VisualEditsMessenger } from "orchids-visual-edits";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "FactorLens — Build real wealth. Backed by data, not noise.",
  description:
    "Factor investing for serious long-term investors — disciplined, low-cost, built on 20 years of real NSE market data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* pt-[64px] accounts for fixed navbar height */}
      <body className="antialiased" style={{ fontFamily: "var(--font-body)", background: "var(--bg)", color: "var(--text-raw)" }}>
        <Navbar />
        <main className="pt-[64px]">{children}</main>
        <VisualEditsMessenger />
      </body>
    </html>
  );
}
