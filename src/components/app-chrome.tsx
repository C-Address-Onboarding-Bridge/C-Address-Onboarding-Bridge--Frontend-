"use client";

/**
 * Splits out the app's normal chrome (wallet context, navbar, footer, status
 * banner, etc.) so the embeddable widget route can skip all of it. (#558)
 *
 * The widget is meant to render inline inside a third-party host's iframe —
 * a full navbar/footer wrapped around it would look broken there, and none
 * of that chrome (in particular WalletProvider's whole session/localStorage
 * story) is something a small, standalone embed needs. This has to live in
 * a client component: the root layout stays a server component (it exports
 * `metadata`), and route pathname is only available client-side without
 * threading it through request headers.
 */
import { usePathname } from "next/navigation";
import { WalletProvider } from "@/components/wallet-provider";
import { HelpProvider } from "@/contexts/HelpContext";
import { FeatureFlagProvider } from "@/contexts/FeatureFlagContext";
import { FeatureFlagPanel } from "@/components/FeatureFlagPanel";
import { StatusBanner } from "@/components/status-banner";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { OfflineBanner } from "@/components/offline-banner";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith("/widget")) {
    return <>{children}</>;
  }

  return (
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
  );
}
