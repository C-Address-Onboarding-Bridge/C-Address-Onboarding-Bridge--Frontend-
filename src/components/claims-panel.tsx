"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Clock3, Lock, Loader2, LockOpen } from "lucide-react";
import { claimLock, listIncomingLocks, LockAlreadyClaimedError } from "@/lib/api";
import {
  countdownTo,
  formatCountdown,
  isLockClaimable,
  isLockMatured,
  sortLocksByUnlockTime,
  type Lock as LockRecord,
} from "@/lib/locks";
import type { StellarNetwork } from "@/lib/types";
import LiveRegion from "@/components/live-region";

/** How often the panel re-fetches lock status from the API. */
const LOCKS_POLL_INTERVAL_MS = 15_000;
/** How often the countdown display re-renders while any lock is still pending. */
const COUNTDOWN_TICK_MS = 1_000;

interface ClaimsPanelProps {
  address: string | null;
  network: StellarNetwork;
  isNetworkSupported: boolean;
}

interface ClaimFeedback {
  lockId: string;
  ok: boolean;
  message: string;
}

/** Shortens an address for display: GABCDEFG…WXYZ. */
function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 8)}…${address.slice(-4)}` : address;
}

/**
 * Lists timelocked transfers incoming to the connected address and lets the
 * recipient claim the ones that have matured (#467).
 *
 * Polls the API on an interval so a lock claimed from another session/device
 * while this view is open is reflected here too — the claim button is
 * disabled the moment a poll (or this session's own claim attempt) reports
 * the lock as no longer pending, rather than trusting whatever was rendered
 * last. See `src/lib/locks.ts` for the (placeholder) lock shape.
 */
export default function ClaimsPanel({ address, network, isNetworkSupported }: ClaimsPanelProps) {
  const [locks, setLocks] = useState<LockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ClaimFeedback | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const claimingRef = useRef<string | null>(null);

  const refresh = useMemo(
    () => async (isInitial: boolean) => {
      if (!address || !isNetworkSupported) return;
      if (isInitial) setLoading(true);
      try {
        const result = await listIncomingLocks(address, network);
        setLocks(sortLocksByUnlockTime(result));
        setError(null);
      } catch {
        // A failed poll leaves the last-known list in place rather than
        // clearing it — losing a correct "claimable" state to a transient
        // network blip would be worse than showing slightly stale data.
        setError("Couldn't refresh locked transfers. Retrying shortly.");
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [address, network, isNetworkSupported]
  );

  useEffect(() => {
    if (!address || !isNetworkSupported) {
      setLocks([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const tick = (isInitial: boolean) => {
      if (cancelled) return;
      refresh(isInitial);
    };
    tick(true);
    const interval = setInterval(() => {
      if (document.hidden) return;
      tick(false);
    }, LOCKS_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) tick(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [address, network, isNetworkSupported, refresh]);

  // Countdown tick: only runs while at least one lock is still pending and
  // unmatured, so the panel doesn't re-render every second once everything
  // is either claimable or claimed.
  const hasPendingUnmatured = locks.some((l) => l.status === "pending" && !isLockMatured(l, now));
  useEffect(() => {
    if (!hasPendingUnmatured) return;
    const interval = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, [hasPendingUnmatured]);

  const handleClaim = async (lock: LockRecord) => {
    // Guards against a double-claim from a fast double-click: once a claim is
    // in flight for a lock, a second click on the same (still-rendered,
    // about-to-be-disabled) button is a no-op rather than a second request.
    if (!address || claimingRef.current) return;
    claimingRef.current = lock.id;
    setClaimingId(lock.id);
    setFeedback(null);
    try {
      const updated = await claimLock(lock.id, address, network);
      setLocks((prev) => sortLocksByUnlockTime(prev.map((l) => (l.id === updated.id ? updated : l))));
      setFeedback({ lockId: lock.id, ok: true, message: `Claimed ${updated.amount} ${updated.asset}.` });
    } catch (e: unknown) {
      if (e instanceof LockAlreadyClaimedError) {
        // Someone else — or this same user from another device — claimed it
        // first. Re-check the server's view immediately instead of leaving a
        // stale "claimable" row up, or (worse) leaving it possible to retry.
        setFeedback({ lockId: lock.id, ok: false, message: e.message });
        await refresh(false);
      } else {
        setFeedback({
          lockId: lock.id,
          ok: false,
          message: e instanceof Error ? e.message : "Claim failed. Please try again.",
        });
        // The failure might still mean the claim went through server-side
        // (e.g. a dropped response) — re-check rather than assume it didn't.
        await refresh(false);
      }
    } finally {
      claimingRef.current = null;
      setClaimingId(null);
    }
  };

  if (!address) return null;

  const announcement = feedback
    ? feedback.ok
      ? `Claim succeeded. ${feedback.message}`
      : `Claim failed. ${feedback.message}`
    : "";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]" data-testid="claims-panel">
      <LiveRegion politeness={feedback?.ok === false ? "assertive" : "polite"} message={announcement} />
      <div className="p-5 border-b border-[var(--border)]">
        <h3 className="font-semibold">Locked Transfers</h3>
      </div>

      {error && (
        <div role="alert" className="mx-5 mt-4 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-xs text-[var(--error)]">
          {error}
        </div>
      )}

      {loading ? (
        <div role="status" className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
          <span className="sr-only">Loading locked transfers…</span>
        </div>
      ) : locks.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">No locked transfers incoming to this address.</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {locks.map((lock) => {
            const claimable = isLockClaimable(lock, now);
            const isThisClaiming = claimingId === lock.id;
            const rowFeedback = feedback?.lockId === lock.id ? feedback : null;

            return (
              <div key={lock.id} data-testid={`lock-row-${lock.id}`} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0">
                      {lock.status === "claimed" ? (
                        <LockOpen className="w-4 h-4 text-[var(--success)]" />
                      ) : (
                        <Lock className="w-4 h-4 text-[var(--primary-light)]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {lock.amount} {lock.asset}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] font-mono truncate">
                        from {truncateAddress(lock.sender)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {lock.status === "claimed" ? (
                      <p data-testid={`lock-status-${lock.id}`} className="text-xs font-medium text-[var(--success)] inline-flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Claimed
                      </p>
                    ) : claimable ? (
                      <p data-testid={`lock-status-${lock.id}`} className="text-xs font-medium text-[var(--success)]">
                        Ready to claim
                      </p>
                    ) : (
                      <p
                        data-testid={`lock-status-${lock.id}`}
                        className="text-xs font-medium text-[var(--text-muted)] inline-flex items-center gap-1"
                      >
                        <Clock3 className="w-3 h-3" />
                        <span data-testid={`lock-countdown-${lock.id}`}>
                          {formatCountdown(countdownTo(lock.unlockTime, now))}
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Unlocks {new Date(lock.unlockTime).toLocaleString()}
                    </p>
                  </div>
                </div>

                {claimable && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleClaim(lock)}
                      disabled={isThisClaiming}
                      data-testid={`claim-button-${lock.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isThisClaiming ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                          Claiming…
                        </>
                      ) : (
                        "Claim"
                      )}
                    </button>
                  </div>
                )}

                {rowFeedback && (
                  <p
                    role={rowFeedback.ok ? "status" : "alert"}
                    data-testid={`claim-feedback-${lock.id}`}
                    className={`mt-2 text-xs flex items-center gap-1 ${
                      rowFeedback.ok ? "text-[var(--success)]" : "text-[var(--error)]"
                    }`}
                  >
                    {rowFeedback.ok ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {rowFeedback.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
