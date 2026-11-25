"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { ErrorBoundary, WalletErrorBoundary } from "@/components/error-boundary";

/**
 * Root client providers: theme and locale state (#870) plus the app-wide error
 * boundaries (#868). Kept in its own component so the server-rendered root
 * layout only needs a single wrapper.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <ErrorBoundary>
          <WalletErrorBoundary>{children}</WalletErrorBoundary>
        </ErrorBoundary>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default AppProviders;
