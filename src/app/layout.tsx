import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { AppChrome } from "@/components/app-chrome";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

// Same source as src/app/sitemap.ts and src/app/robots.ts (#727) — keeps the
// three in sync instead of each hard-coding its own placeholder domain. (#942)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  // Lets every relative URL below (and in child layouts' metadata) resolve
  // against the real deployment origin instead of staying relative to
  // nothing / defaulting to example.com. (#942)
  metadataBase: new URL(SITE_URL),
  title: "C-Address Bridge | Soroban Onboarding Protocol",
  description:
    "Fund any Soroban smart account (C-address) directly — from a CEX withdrawal, a credit card, or an existing G-address.",
  keywords: [
    "Soroban",
    "Stellar",
    "C-address",
    "smart contract",
    "blockchain",
    "bridge",
    "onboarding",
  ],
  openGraph: {
    title: "C-Address Bridge",
    description:
      "Fund any Soroban smart account (C-address) directly from a CEX withdrawal, a credit card, or an existing G-address.",
    url: "/",
    type: "website",
    siteName: "C-Address Bridge",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "C-Address Bridge - Fund Soroban Smart Accounts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "C-Address Bridge",
    description:
      "Fund Soroban smart accounts directly from CEX, credit card, or G-address.",
    images: ["/og-image.png"],
    creator: "@stellar",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
  // Only the homepage's own canonical lives here. Child layouts for other
  // indexable routes (/bridge, /cex, /onramp, /confirm/[hash]) each set
  // their own `alternates.canonical` — Next merges metadata by key, so
  // leaving a root-level canonical in place would otherwise apply the
  // homepage's URL to every route that doesn't override it. (#942)
  alternates: {
    canonical: "/",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the per-request CSP nonce set by the proxy (#698, #876). The
  // enforcing Content-Security-Policy uses `script-src 'self' 'nonce-…'
  // 'strict-dynamic'`, so every inline script must carry the matching nonce or
  // the browser blocks it. `headers()` is async in Next 15+.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "C-Address Bridge",
    description:
      "Fund any Soroban smart account (C-address) directly from a CEX withdrawal, a credit card, or an existing G-address.",
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      priceCurrency: "XLM",
      price: "0",
    },
    author: {
      "@type": "Organization",
      name: "Stellar Development Foundation",
      url: "https://stellar.org",
    },
  };

  return (
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable}`}>
      <head>
        <Script
          id="theme-init"
          src="/theme-init.js"
          strategy="beforeInteractive"
          nonce={nonce}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
        >
          {JSON.stringify(structuredData).replace(/</g, "\\u003c")}
        </script>
      </head>
      <body className="antialiased">
        <AppProviders>
          <AppChrome>{children}</AppChrome>
        </AppProviders>
      </body>
    </html>
  );
}
