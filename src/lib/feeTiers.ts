/**
 * Volume-based fee tiers (#468).
 *
 * `getFeeTierPreview` in `src/lib/api.ts` now reads an account's real
 * cumulative volume on-chain via `getRebateVolume` (#673, Soroban RPC
 * simulation of the bridge contract's `rebate_for`), rather than a
 * `/fee-tiers/preview` route that never existed. `DEFAULT_FEE_TIERS` below —
 * the tier names, thresholds, and rates themselves — is still a best guess:
 * no contract ABI documents the actual tier ladder, only that `rebate_for`
 * exists. Must be reconciled against the real contract's configuration once
 * that's available; everything else in this file (the pure display logic) is
 * unaffected by that uncertainty.
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
 * The tier ladder itself — see the PLACEHOLDER note at the top of this file.
 * Ascending by volumeThreshold; the lowest tier's threshold must be 0 so
 * every account falls into some tier.
 */
export const DEFAULT_FEE_TIERS: FeeTier[] = [
  { name: "Base", volumeThreshold: 0, feeRate: 0.005 },
  { name: "Silver", volumeThreshold: 1000, feeRate: 0.003 },
  { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 },
];

/**
 * Maps a raw cumulative-volume number (e.g. from `getRebateVolume`, #673)
 * onto a tier ladder, producing the `FeeTierStatus` the display logic below
 * expects. `tiers` need not be pre-sorted. A volume below every threshold
 * (shouldn't happen if the lowest tier's threshold is 0, but the input is
 * external data) falls back to the lowest tier rather than being left
 * without a `currentTier`.
 */
export function buildFeeTierStatus(volume: number, tiers: FeeTier[] = DEFAULT_FEE_TIERS): FeeTierStatus {
  const sorted = [...tiers].sort((a, b) => a.volumeThreshold - b.volumeThreshold);
  let currentIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (volume >= sorted[i].volumeThreshold) currentIndex = i;
  }
  return {
    currentVolume: volume,
    currentTier: sorted[currentIndex],
    nextTier: sorted[currentIndex + 1] ?? null,
    tiers: sorted,
  };
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
