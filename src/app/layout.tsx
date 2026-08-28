import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { WalletProvider } from "@/components/wallet-provider";
import { FeatureFlagProvider } from "@/contexts/FeatureFlagContext";
import { FeatureFlagPanel } from "@/components/FeatureFlagPanel";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

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
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the per-request nonce injected by middleware so Next.js can attach it
  // to inline scripts it generates (hydration bootstrap, etc.). (#457)
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Pass the nonce to Next.js inline script injection via the meta tag.
            Next.js reads this during SSR to nonce-tag its own inline scripts. */}
        {nonce && <meta name="x-nonce" content={nonce} />}
      </head>
      <body className="antialiased">
        <FeatureFlagProvider>
          <WalletProvider>
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
          </WalletProvider>
        </FeatureFlagProvider>
      </body>
    </html>
  );
}
