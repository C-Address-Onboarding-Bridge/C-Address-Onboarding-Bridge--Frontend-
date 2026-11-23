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
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { clearReauthRequired } from "@/lib/inactivityTimeout";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ReauthGate() {
  const { isConnected, connect } = useWallet();
  const { inactivityState, extend } = useInactivityTimeout();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const reconnectButtonRef = useRef<HTMLButtonElement | null>(null);

  const isOpen = Boolean(isConnected && inactivityState?.reauthRequired);

  // Move focus into the dialog on mount and trap Tab/Shift+Tab inside it so
  // keyboard users can't reach the signing/funding buttons behind it. (#1027)
  useEffect(() => {
    if (!isOpen) return;
    reconnectButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen]);

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

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={dialogRef}
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
          ref={reconnectButtonRef}
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
