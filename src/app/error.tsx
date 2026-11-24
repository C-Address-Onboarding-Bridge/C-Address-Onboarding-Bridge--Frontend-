"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { ErrorCode, handleError, parseError } from "@/lib/errors";
import { toSafeErrorMessage } from "@/lib/stellar";
import { readInFlightTransaction, type InFlightTransaction } from "@/components/error-boundary";

const DEFAULT_ERROR_MESSAGE = "An unexpected error occurred. Please try again.";

const WALLET_ERROR_CODES = new Set<ErrorCode>([
  ErrorCode.WALLET_NOT_FOUND,
  ErrorCode.WALLET_CONNECTION_FAILED,
  ErrorCode.NETWORK_MISMATCH,
]);

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [inFlight, setInFlight] = useState<InFlightTransaction | null>(null);

  useEffect(() => {
    const context = error.digest ? `app-error:${error.digest}` : "app-error";
    handleError(error, context);
    setInFlight(readInFlightTransaction());
  }, [error]);

  const parsed = parseError(error);
  const isWalletError = WALLET_ERROR_CODES.has(parsed.code);
  const safeMessage = isWalletError
    ? "The wallet layer hit an unexpected error. Try again or refresh the page — your accounts and transactions are safe."
    : toSafeErrorMessage(error, DEFAULT_ERROR_MESSAGE);

  return (
    <div role="alert" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--error)]/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-[var(--error)]" />
        </div>
        <h1 className="text-2xl font-bold mb-2">
          {isWalletError ? "Wallet connection issue" : "Something went wrong"}
        </h1>
        <p className="text-[var(--text-muted)] mb-6 max-w-md mx-auto">
          {safeMessage}
        </p>
        {inFlight && (
          <a
            href={`/transactions/${encodeURIComponent(inFlight.hash)}${inFlight.network ? `?network=${encodeURIComponent(inFlight.network)}` : ""}`}
            data-testid="in-flight-transaction-link"
            className="block max-w-md mx-auto mb-6 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-left"
          >
            <span className="block text-xs text-[var(--text-muted)] mb-1">
              A transaction was already submitted — it is still being confirmed:
            </span>
            <span className="block text-sm font-mono break-all text-[var(--primary-light)]">
              {inFlight.hash}
            </span>
          </a>
        )}
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}