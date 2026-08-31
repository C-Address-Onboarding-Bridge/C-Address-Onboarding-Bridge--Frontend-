"use client";

import { WifiOff, Wifi, X } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";

/**
 * Offline-aware status banner. (#475)
 *
 * Shows a clear offline indicator, lists queued operations (safe ones replay on
 * reconnect, funding ones wait for explicit confirmation), and lets the user
 * cancel anything that is queued. Rendered app-wide inside the WalletProvider.
 */
export function OfflineBanner() {
  const { isOnline, pendingOperations, cancelOperation, confirmFunding } = useWallet();

  const funding = pendingOperations.filter((op) => op.kind === "funding");
  const hasQueued = pendingOperations.length > 0;

  if (isOnline && !hasQueued) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 space-y-3 p-4 rounded-xl border bg-[var(--surface-2)] border-[var(--border)] shadow-lg"
    >
      {!isOnline && (
        <div className="flex items-start gap-2">
          <WifiOff className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--foreground)]">
            You&apos;re offline. Actions that need the network are queued and will
            replay automatically when you reconnect.
          </p>
        </div>
      )}

      {isOnline && hasQueued && (
        <div className="flex items-start gap-2">
          <Wifi className="w-5 h-5 text-[var(--success)] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--foreground)]">
            Reconnected — replaying queued actions.
          </p>
        </div>
      )}

      {hasQueued && (
        <ul className="space-y-2">
          {pendingOperations.map((op) => (
            <li
              key={op.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-[var(--text-muted)]">{op.label}</span>
              <button
                type="button"
                onClick={() => cancelOperation(op.id)}
                aria-label={`Cancel queued action: ${op.label}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}

      {funding.length > 0 && (
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <p className="text-xs text-[var(--text-muted)]">
            Funding submissions are never sent automatically. Confirm to send
            them now.
          </p>
          <button
            type="button"
            onClick={() => void confirmFunding()}
            className="w-full px-3 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
          >
            Confirm &amp; send {funding.length}
          </button>
        </div>
      )}
    </div>
  );
}

export default OfflineBanner;
