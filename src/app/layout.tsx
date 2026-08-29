import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { WalletProvider } from "@/components/wallet-provider";
import { FeatureFlagProvider } from "@/contexts/FeatureFlagContext";
import { FeatureFlagPanel } from "@/components/FeatureFlagPanel";
import { StatusBanner } from "@/components/status-banner";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { OfflineBanner } from "@/components/offline-banner";
import { HelpProvider } from "@/contexts/HelpContext";

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
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </head>
      <body className="antialiased">
        <FeatureFlagProvider>
          <WalletProvider>
            <HelpProvider>
              <StatusBanner />
            <div className="min-h-screen flex flex-col">
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--primary)] focus:text-white focus:font-medium focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
              >
                Skip to main content
              </a>
              <Navbar />
              <main id="main-content" tabIndex={-1} className="flex-1 pt-16">
                {children}
              </main>
              <Footer />
            </div>
            <FeatureFlagPanel />
              <ServiceWorkerRegistrar />
              <OfflineBanner />
            </HelpProvider>
          </WalletProvider>
        </FeatureFlagProvider>
      </body>
    </html>
  );
}
