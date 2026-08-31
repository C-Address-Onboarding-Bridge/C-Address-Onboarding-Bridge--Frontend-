/**
 * Volume-based fee tiers (#468).
 *
 * PLACEHOLDER INTERFACE: this repo vendors neither the fee-tier contract
 * bindings nor a real API client for the preview endpoint yet (no contract
 * source, no tier-related route, nothing in docs — checked before writing
 * this, the same way #465's batch cap and #467's lock/claim shape were).
 * Field names, thresholds, and the API route in `src/lib/api.ts` are a
 * best-guess shape and MUST be reconciled against the real contract/API once
 * available.
 *
 * `nextTier` is `null` exactly at the top tier — there's nothing further to
 * progress toward, which the display logic below treats as its own case
 * rather than a progress bar stuck at 100%.
 */
export interface FeeTier {
  name: string;
  /** Minimum cumulative volume (in the quoted asset) required to reach this tier. */
  volumeThreshold: number;
  /** Fee rate at this tier, as a fraction of the transferred amount (e.g. 0.001 = 0.10%). */
  feeRate: number;
}

export interface FeeTierStatus {
  /** The account's cumulative volume used to determine its tier. */
  currentVolume: number;
  currentTier: FeeTier;
  /** The next tier to progress toward, or null at the top tier. */
  nextTier: FeeTier | null;
  /** All configured tiers, ascending by volumeThreshold. Empty when no tiers are configured. */
  tiers: FeeTier[];
}

/**
 * True when there is real tier data to show. Both "no response" (API/contract
 * not configured) and "an empty tiers list" count as unconfigured — either
 * way there's nothing meaningful to render (#468 requirement: hide the whole
 * display rather than show a broken/empty one).
 */
export function hasConfiguredTiers(status: FeeTierStatus | null | undefined): status is FeeTierStatus {
  return !!status && Array.isArray(status.tiers) && status.tiers.length > 0;
}

/** True once the account has no further tier to progress toward. */
export function isTopTier(status: FeeTierStatus): boolean {
  return status.nextTier === null;
}

export interface TierProgress {
  currentVolume: number;
  nextThreshold: number;
  /** 0–100, clamped — volume can't be negative, but a stale/inconsistent read shouldn't render outside the bar. */
  percent: number;
}

/** Progress toward `nextTier`, or null at the top tier (there's nothing to progress toward). */
export function progressToNextTier(status: FeeTierStatus): TierProgress | null {
  if (isTopTier(status)) return null;
  const next = status.nextTier as FeeTier;
  const span = next.volumeThreshold - status.currentTier.volumeThreshold;
  const progressed = status.currentVolume - status.currentTier.volumeThreshold;
  const percent = span <= 0 ? 100 : Math.min(100, Math.max(0, (progressed / span) * 100));
  return { currentVolume: status.currentVolume, nextThreshold: next.volumeThreshold, percent };
}

/** Renders a fee rate as a percentage string, e.g. 0.001 -> "0.10%". */
export function formatFeeRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/** The fee for `amount` at the account's current tier — the actual discounted rate, not a flat one. */
export function computeTieredFee(amount: number, status: FeeTierStatus): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount * status.currentTier.feeRate;
}
