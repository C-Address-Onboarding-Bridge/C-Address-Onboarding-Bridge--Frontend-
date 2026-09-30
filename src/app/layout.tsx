import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ErrorBoundary, WalletErrorBoundary } from "@/components/error-boundary";
import { AppChrome } from "@/components/app-chrome";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
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
    url: "https://c-address-bridge.example.com",
    type: "website",
    siteName: "C-Address Bridge",
    images: [
      {
        url: "https://c-address-bridge.example.com/og-image.png",
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
    images: ["https://c-address-bridge.example.com/og-image.png"],
    creator: "@stellar",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
  alternates: {
    canonical: "https://c-address-bridge.example.com",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the per-request CSP nonce set by the middleware (#698). The enforcing
  // Content-Security-Policy uses `script-src 'self' 'nonce-…'`, so every inline
  // script must carry the matching nonce or the browser blocks it.
  const nonce = headers().get("x-nonce") ?? undefined;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "C-Address Bridge",
    description:
      "Fund any Soroban smart account (C-address) directly from a CEX withdrawal, a credit card, or an existing G-address.",
    url: "https://c-address-bridge.example.com",
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
        />
        <script
          type="application/ld+json"
        >
          {JSON.stringify(structuredData).replace(/</g, "\\u003c")}
        </script>
      </head>
      <body className="antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
