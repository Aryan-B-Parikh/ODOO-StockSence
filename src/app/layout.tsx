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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StockSense",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "StockSense — Warehouse Inventory Intelligence",
    description:
      "Every unit tracked, reserved, and reconciled — receipts, deliveries, transfers, cycle counts and an immutable ledger.",
    siteName: "StockSense",
    type: "website",
  },
};

/**
 * Zoom must stay enabled — WCAG 1.4.4 (Resize Text) forbids disabling
 * user scaling, and warehouse staff routinely pinch-zoom barcode/lot numbers.
 * `initialScale: 1` only controls the load-time scale.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
