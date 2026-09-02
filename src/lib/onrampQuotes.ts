/**
 * On-ramp provider quote comparison (#556).
 *
 * The onramp page already computes a correct fee/net-receive estimate per
 * provider (`getProviderFeeRate`/`calculateOnrampFeeAndReceive` in
 * `onramp-page.tsx`) — and because the only crypto asset this app on-ramps
 * into is USDC, a dollar-pegged stablecoin, that estimate does not depend on
 * a live crypto price feed the way a BTC/ETH quote would. This module turns
 * that per-provider estimate into a ranked, side-by-side comparison, and
 * defines the shape a live quote (fetched by `/api/onramp/quotes`, or any
 * future provider integration) must have to slot into the same ranking:
 * `source: "live"` quotes and `source: "estimated"` ones are ranked
 * identically, so a provider whose live quote fails or isn't configured
 * degrades to its estimate rather than dropping out of the comparison.
 */
import { providers, getProviderFeeRate, calculateOnrampFeeAndReceive } from "@/components/routes/onramp-page";
import type { OnrampProvider, OnrampQuote } from "./types";
import { isOnrampProvider } from "./types";

export { formatNotificationAge as formatQuoteAge } from "./notifications";

/** Where a quote's numbers came from. */
export type QuoteSource = "live" | "estimated";

/** Parsed `$min - $max` bounds from a provider's advertised limits string. */
export interface QuoteLimits {
  min: number;
  max: number;
}

/** One provider's ranked place in a comparison. */
export interface OnrampQuoteComparison extends OnrampQuote {
  providerName: string;
  source: QuoteSource;
  /** Epoch ms this quote's numbers were computed/fetched. */
  quotedAt: number;
  /** 1 = best (highest destination amount). Tied quotes share a rank (dense ranking). */
  rank: number;
  isBest: boolean;
  limits: QuoteLimits | null;
  /** Null when limits couldn't be parsed — "unknown" is not the same as "within". */
  withinLimits: boolean | null;
}

/** A live quote fetched externally, for one provider. Same numbers an `OnrampQuote` carries. */
export type LiveQuoteInput = Pick<OnrampQuote, "destinationAmount" | "fee" | "sourceAmount">;

/**
 * Parses a provider's `"$20 - $10,000"`-style limits string. Returns null
 * (unknown, not "no limit") if the format ever changes and this can't keep
 * up — callers must treat null as "can't tell", not as "unlimited".
 */
export function parseProviderLimits(limits: string): QuoteLimits | null {
  const match = limits.match(/\$?([\d,]+(?:\.\d+)?)\s*-\s*\$?([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const min = Number(match[1].replace(/,/g, ""));
  const max = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/** True when `amount` falls within `limits`, inclusive. Null limits (unknown) are never "within". */
export function isWithinLimits(amount: number, limits: QuoteLimits | null): boolean | null {
  if (!limits) return null;
  return amount >= limits.min && amount <= limits.max;
}

function providerMeta(id: OnrampProvider) {
  const p = providers.find((provider) => provider.id === id);
  if (!p) throw new Error(`Unknown onramp provider: ${id}`);
  return p;
}

/**
 * Builds this app's own fee-model estimate for one provider — the fallback
 * every comparison entry uses when no live quote is available.
 */
export function buildEstimatedQuote(
  providerId: OnrampProvider,
  fiatAmount: number,
  fiatCurrency: string,
  now: number = Date.now()
): OnrampQuoteComparison {
  const meta = providerMeta(providerId);
  const { fee, receive } = calculateOnrampFeeAndReceive(fiatAmount, providerId);
  const limits = parseProviderLimits(meta.limits);
  return {
    provider: providerId,
    providerName: meta.name,
    sourceAmount: fiatAmount.toFixed(2),
    destinationAmount: receive.toFixed(2),
    fee: fee.toFixed(2),
    fiatCurrency,
    cryptoCurrency: "USDC",
    source: "estimated",
    quotedAt: now,
    rank: 0, // filled in by rankQuotes
    isBest: false,
    limits,
    withinLimits: isWithinLimits(fiatAmount, limits),
  };
}

/** Turns an external live quote into a comparison entry, same shape as the estimate it replaces. */
function toLiveComparison(
  providerId: OnrampProvider,
  fiatAmount: number,
  fiatCurrency: string,
  live: LiveQuoteInput,
  now: number
): OnrampQuoteComparison {
  const meta = providerMeta(providerId);
  const limits = parseProviderLimits(meta.limits);
  return {
    provider: providerId,
    providerName: meta.name,
    sourceAmount: live.sourceAmount,
    destinationAmount: live.destinationAmount,
    fee: live.fee,
    fiatCurrency,
    cryptoCurrency: "USDC",
    source: "live",
    quotedAt: now,
    rank: 0,
    isBest: false,
    limits,
    withinLimits: isWithinLimits(fiatAmount, limits),
  };
}

/**
 * Ranks a set of already-built comparison entries by destination amount
 * (highest first) using dense ranking — equal quotes tie at the same rank
 * rather than one arbitrarily edging out the other, and the rank after a tie
 * skips ahead correctly (1, 1, 2 — not 1, 1, 3). Mutates nothing; returns a
 * new sorted array.
 */
export function rankQuotes(quotes: OnrampQuoteComparison[]): OnrampQuoteComparison[] {
  const sorted = [...quotes].sort(
    (a, b) => Number(b.destinationAmount) - Number(a.destinationAmount)
  );
  let rank = 0;
  let lastAmount: number | null = null;
  return sorted.map((q) => {
    const amount = Number(q.destinationAmount);
    if (lastAmount === null || amount < lastAmount) {
      rank += 1;
      lastAmount = amount;
    }
    return { ...q, rank, isBest: rank === 1 };
  });
}

/**
 * Builds the ranked, side-by-side provider comparison for a given fiat
 * amount/currency. Providers that don't support `fiatCurrency` are left out
 * (same restriction the onramp form itself enforces) rather than shown with
 * a quote they can't actually honour. A provider whose live quote is
 * missing, or whose fetch failed upstream, silently falls back to this
 * app's own estimate — provider-level failure never removes it from the
 * comparison or breaks the others (each entry is independent).
 */
export function compareOnrampQuotes(
  fiatAmount: number,
  fiatCurrency: string,
  options: {
    liveQuotes?: Partial<Record<OnrampProvider, LiveQuoteInput>>;
    now?: number;
  } = {}
): OnrampQuoteComparison[] {
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) return [];
  const now = options.now ?? Date.now();
  const liveQuotes = options.liveQuotes ?? {};

  const entries = providers
    .filter((p) => p.currencies.includes(fiatCurrency))
    .map((p) => {
      if (!isOnrampProvider(p.id)) return null; // defensive; providers[] ids are always OnrampProvider today
      const live = liveQuotes[p.id];
      return live
        ? toLiveComparison(p.id, fiatAmount, fiatCurrency, live, now)
        : buildEstimatedQuote(p.id, fiatAmount, fiatCurrency, now);
    })
    .filter((q): q is OnrampQuoteComparison => q !== null);

  return rankQuotes(entries);
}

/** The top-ranked quote, or null for an empty comparison. */
export function bestQuote(comparisons: OnrampQuoteComparison[]): OnrampQuoteComparison | null {
  return comparisons.find((q) => q.isBest) ?? null;
}

/**
 * The spread between the best and worst quote's destination amount — how
 * much USDC picking the wrong provider would cost, in absolute terms and as
 * a percentage of the best quote. Null when there's nothing to compare (0 or
 * 1 entries).
 */
export function quoteSpread(
  comparisons: OnrampQuoteComparison[]
): { absolute: number; percent: number } | null {
  if (comparisons.length < 2) return null;
  const amounts = comparisons.map((q) => Number(q.destinationAmount));
  const best = Math.max(...amounts);
  const worst = Math.min(...amounts);
  const absolute = best - worst;
  return { absolute, percent: best > 0 ? (absolute / best) * 100 : 0 };
}

/** Re-derives fee rate as a percentage string for display, e.g. 0.045 -> "4.50%". Mirrors feeTiers.ts's formatFeeRate. */
export function formatQuoteFeeRate(providerId: OnrampProvider): string {
  return `${(getProviderFeeRate(providerId) * 100).toFixed(2)}%`;
}
