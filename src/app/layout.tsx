import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockSense — Warehouse Inventory Intelligence",
  description:
    "StockSense is a warehouse inventory management system: every unit tracked, reserved, and reconciled across receipts, deliveries, transfers, cycle counts, adjustments and an immutable movement ledger.",
  keywords: [
    "warehouse",
    "inventory",
    "inventory management",
    "stock control",
    "cycle counts",
    "reorder",
    "logistics",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "StockSense — Warehouse Inventory Intelligence",
    description:
      "Every unit tracked, reserved, and reconciled — receipts, deliveries, transfers, cycle counts and an immutable ledger.",
    siteName: "StockSense",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c1210" },
    { media: "(prefers-color-scheme: light)", color: "#f7faf8" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
