import type { Metadata } from "next";
import "./globals.css";
import { VisualEditsMessenger } from "orchids-visual-edits";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "FactorLens — Institutional Portfolio Analytics",
  description:
    "Build smarter portfolios backed by 20+ years of NSE backtest data. Select funds, allocate weights, and instantly see risk-adjusted performance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <Navbar />
          {/* pt-[52px] on mobile for top bar; pb-[72px] for bottom nav */}
          <main className="pt-[52px] md:pt-0 pb-[72px] md:pb-0">{children}</main>
        </ThemeProvider>
        <VisualEditsMessenger />
      </body>
    </html>
  );
}
