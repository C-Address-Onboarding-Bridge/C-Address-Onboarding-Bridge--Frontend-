/**
 * Timelocked funding & claims — pure logic (#467).
 *
 * PLACEHOLDER INTERFACE: this repo vendors neither the timelock contract
 * bindings nor a real API client for locks/claims yet (no contract source,
 * no lock-related route, nothing in docs — checked before writing this).
 * The shape below — `unlockTime` (epoch ms) plus a `claimed` boolean, modeled
 * as the two-value `LockStatus` — mirrors the common Soroban timelock
 * pattern, but every field name, status value, and the API routes in
 * `src/lib/api.ts` are a best guess and MUST be reconciled against the real
 * contract/API once available.
 *
 * "Claimable" is deliberately not a third status value: maturity is a pure
 * function of time, so a lock is claimable exactly when it is still
 * `"pending"` and `unlockTime` has passed. Keeping the server status
 * two-valued avoids the server and the client's clock ever disagreeing about
 * a third state.
 */
import type { StellarNetwork } from "./types";

export type LockStatus = "pending" | "claimed";

export interface Lock {
  id: string;
  sender: string;
  recipient: string;
  amount: string;
  asset: string;
  /** Epoch milliseconds at which the lock matures and can be claimed. */
  unlockTime: number;
  status: LockStatus;
  /** Present once claimed. */
  claimTxHash?: string;
  /** Epoch milliseconds. */
  createdAt: number;
  network: StellarNetwork;
}

/** True once `lock.unlockTime` has passed, regardless of claim status. */
export function isLockMatured(lock: Pick<Lock, "unlockTime">, now: number = Date.now()): boolean {
  return now >= lock.unlockTime;
}

/** True when a lock is both matured and not yet claimed. */
export function isLockClaimable(lock: Pick<Lock, "unlockTime" | "status">, now: number = Date.now()): boolean {
  return lock.status === "pending" && isLockMatured(lock, now);
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Milliseconds remaining, floored at 0 (never negative). */
  totalMs: number;
}

/** Breaks the time remaining until `targetMs` into whole day/hour/minute/second parts. */
export function countdownTo(targetMs: number, now: number = Date.now()): CountdownParts {
  const totalMs = Math.max(0, targetMs - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
  };
}

/** Renders countdown parts as a compact human string, e.g. "2d 5h", "12m 4s". */
export function formatCountdown(parts: CountdownParts): string {
  if (parts.totalMs <= 0) return "Ready to claim";
  const { days, hours, minutes, seconds } = parts;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Validates an unlock date/time typed into a `datetime-local` input.
 * Requires a parseable date strictly in the future — a lock that unlocks in
 * the past (or "now") is just an instant transfer with extra steps, and is
 * almost always a sign the user picked the wrong date.
 */
export function validateUnlockTime(raw: string, now: number = Date.now()): { ok: true; unlockTime: number } | { ok: false; error: string } {
  if (!raw) {
    return { ok: false, error: "Unlock date/time is required" };
  }
  const parsed = new Date(raw).getTime();
  if (Number.isNaN(parsed)) {
    return { ok: false, error: "Invalid date/time" };
  }
  if (parsed <= now) {
    return { ok: false, error: "Unlock time must be in the future" };
  }
  return { ok: true, unlockTime: parsed };
}

/** Sorts locks soonest-to-unlock first, a stable order across re-polls. */
export function sortLocksByUnlockTime(locks: Lock[]): Lock[] {
  return [...locks].sort((a, b) => a.unlockTime - b.unlockTime);
}
