"use client";

/**
 * Mounts the inactivity timeout for wallet-connected sessions and blocks
 * signing/funding actions with an explicit re-confirmation overlay once the
 * session has timed out. (#493, #935)
 *
 * This is mounted once, inside WalletProvider, so every route shares a
 * single timer instead of each page wiring its own (and losing the
 * re-auth requirement to a stray unmount).
 */
import { useCallback, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { clearReauthRequired } from "@/lib/inactivityTimeout";

export function ReauthGate() {
  const { isConnected, connect } = useWallet();
  const { inactivityState, extend } = useInactivityTimeout();
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconfirm = useCallback(async () => {
    setIsReconnecting(true);
    try {
      // Require an explicit wallet re-confirmation before clearing the
      // flag - a reload or background timer must never clear it on its
      // own (that's the bug this component exists to close).
      await connect();
      clearReauthRequired();
      extend();
    } finally {
      setIsReconnecting(false);
    }
  }, [connect, extend]);

  if (!isConnected || !inactivityState?.reauthRequired) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reauth-gate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
    >
      <div className="max-w-sm w-full rounded-xl bg-[var(--surface)] p-6 shadow-xl text-center">
        <h2 id="reauth-gate-title" className="text-lg font-semibold">
          Session timed out
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          You&apos;ve been inactive for a while. Reconnect your wallet to
          continue signing or funding.
        </p>
        <button
          type="button"
          onClick={() => void handleReconfirm()}
          disabled={isReconnecting}
          className="mt-4 w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-white font-medium disabled:opacity-60"
        >
          {isReconnecting ? "Reconnecting..." : "Reconnect wallet"}
        </button>
      </div>
    </div>
  );
}
