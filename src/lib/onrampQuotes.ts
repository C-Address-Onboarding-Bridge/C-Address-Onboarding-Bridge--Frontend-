/**
- On-ramp provider quote comparison (#556, #943).
 */
import {
  providers,
  getProviderFeeRate,
  calculateOnrampFeeAndReceive,
  getConfiguredFxRates,
  getUsdExchangeRate,
} from "@/lib/onrampProviders";
import type { OnrampProvider, OnrampQuote } from "./types";
import { isOnrampProvider } from "./types";

export { formatNotificationAge as formatQuoteAge } from "./notifications";

/** Where a quote's numbers came from. */
export type QuoteSource = "live" | "estimated";

/** Parsed `[min, max]` bounds for a provider in the active currency. */
export interface QuoteLimits {
  min: number;
  max: number;
}

/** One provider's ranked place in a comparison. */
export interface OnrampQuoteComparison extends OnrampQuote {
  providerName: string;
  source: QuoteSource;
  /** False when a non-USD currency has neither a live quote nor a configured FX rate. (#943) */
  estimateAvailable: boolean;
  /** Epoch ms this quote's numbers were computed/fetched. */
  quotedAt: number;
  /** 1 = best (highest destination amount). Tied quotes share a rank (dense ranking). */
  rank: number;
  isBest: boolean;
  limits: QuoteLimits | null;
  /** Null when limits couldn't be parsed or converted — "unknown" is not the same as "within". */
  withinLimits: boolean | null;
}

/** A live quote fetched externally, for one provider. Same numbers an `OnrampQuote` carries. */
export type LiveQuoteInput = Pick<OnrampQuote, "destinationAmount" | "fee" | "sourceAmount">;

/**
- Parses a provider's `"$20 - $10,000"`-style limits string (in USD) and
- optionally converts them into `fiatCurrency` via `rates`. Returns null
- when the format cannot be parsed or when `fiatCurrency` is non-USD and no
- FX rate is configured. (#943)
 */
export function parseProviderLimits(
  limits: string,
  fiatCurrency: string = "USD",
  rates: Readonly<Record<string, number>> = getConfiguredFxRates()
): QuoteLimits | null {
  const match = limits.match(/\$?([\d,]+(?:\.\d+)?)\s*-\s*\$?([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const minUsd = Number(match[1].replace(/,/g, ""));
  const maxUsd = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(minUsd) || !Number.isFinite(maxUsd)) return null;

  const rate = getUsdExchangeRate(fiatCurrency, rates);
  if (rate === null) return null;

  return {
    min: Number((minUsd / rate).toFixed(2)),
    max: Number((maxUsd / rate).toFixed(2)),
  };
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
- Builds this app's own fee-model estimate for one provider — the fallback
- every comparison entry uses when no live quote is available.
 *
- Applies the configured FX rate for `fiatCurrency` before computing USDC
- received; when no rate is configured for a non-USD currency, marks
- `estimateAvailable: false` and leaves `destinationAmount` empty so callers
- show "Live quote needed" instead of a bogus 1:1 estimate. (#943)
 */
export function buildEstimatedQuote(
  providerId: OnrampProvider,
  fiatAmount: number,
  fiatCurrency: string,
  now: number = Date.now(),
  rates: Readonly<Record<string, number>> = getConfiguredFxRates()
): OnrampQuoteComparison {
  const meta = providerMeta(providerId);
  const { fee, receive, rateAvailable } = calculateOnrampFeeAndReceive(
    fiatAmount,
    providerId,
    fiatCurrency,
    rates
  );
  const limits = parseProviderLimits(meta.limits, fiatCurrency, rates);
  return {
    provider: providerId,
    providerName: meta.name,
    sourceAmount: fiatAmount.toFixed(2),
    destinationAmount: rateAvailable && receive !== null ? receive.toFixed(2) : "",
    fee: fee.toFixed(2),
    fiatCurrency,
    cryptoCurrency: "USDC",
    source: "estimated",
    estimateAvailable: rateAvailable,
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
  now: number,
  rates: Readonly<Record<string, number>> = getConfiguredFxRates()
): OnrampQuoteComparison {
  const meta = providerMeta(providerId);
  let limits = parseProviderLimits(meta.limits, fiatCurrency, rates);
  // If no static FX rate is configured, infer the implied rate from the live
  // quote's sourceAmount/destinationAmount so limits are still checked in fiat.
  if (!limits && fiatCurrency.toUpperCase() !== "USD") {
    const src = Number(live.sourceAmount);
    const dst = Number(live.destinationAmount);
    const feeRate = getProviderFeeRate(providerId);
    if (src > 0 && dst > 0 && feeRate < 1) {
      const impliedRate = dst / (src * (1 - feeRate));
      if (Number.isFinite(impliedRate) && impliedRate > 0) {
        limits = parseProviderLimits(meta.limits, fiatCurrency, {
          [fiatCurrency.toUpperCase()]: impliedRate,
        });
      }
    }
  }
  return {
    provider: providerId,
    providerName: meta.name,
    sourceAmount: live.sourceAmount,
    destinationAmount: live.destinationAmount,
    fee: live.fee,
    fiatCurrency,
    cryptoCurrency: "USDC",
    source: "live",
    estimateAvailable: true,
    quotedAt: now,
    rank: 0,
    isBest: false,
    limits,
    withinLimits: isWithinLimits(fiatAmount, limits),
  };
}

/**
- Ranks a set of already-built comparison entries by destination amount
- (highest first) using dense ranking. Entries without an available estimate
- (`estimateAvailable === false`) are placed at the end and never marked `isBest`.
 */
export function rankQuotes(quotes: OnrampQuoteComparison[]): OnrampQuoteComparison[] {
  const available = quotes.filter((q) => q.estimateAvailable && q.destinationAmount !== "");
  const unavailable = quotes.filter((q) => !q.estimateAvailable || q.destinationAmount === "");

  const sortedAvailable = [...available].sort(
    (a, b) => Number(b.destinationAmount) - Number(a.destinationAmount)
  );
  let rank = 0;
  let lastAmount: number | null = null;
  const rankedAvailable = sortedAvailable.map((q) => {
    const amount = Number(q.destinationAmount);
    if (lastAmount === null || amount < lastAmount) {
      rank += 1;
      lastAmount = amount;
    }
    return { ...q, rank, isBest: rank === 1 };
  });

  const rankedUnavailable = unavailable.map((q) => ({
    ...q,
    rank: rank + 1,
    isBest: false,
  }));

  return [...rankedAvailable, ...rankedUnavailable];
}

/**
- Builds the ranked, side-by-side provider comparison for a given fiat
- amount/currency.
 */
export function compareOnrampQuotes(
  fiatAmount: number,
  fiatCurrency: string,
  options: {
    liveQuotes?: Partial<Record<OnrampProvider, LiveQuoteInput>>;
    now?: number;
    fxRates?: Readonly<Record<string, number>>;
  } = {}
): OnrampQuoteComparison[] {
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) return [];
  const now = options.now ?? Date.now();
  const liveQuotes = options.liveQuotes ?? {};
  const rates = options.fxRates ?? getConfiguredFxRates();

  const entries = providers
    .filter((p) => p.currencies.includes(fiatCurrency))
    .map((p) => {
      if (!isOnrampProvider(p.id)) return null;
      const live = liveQuotes[p.id];
      return live
        ? toLiveComparison(p.id, fiatAmount, fiatCurrency, live, now, rates)
        : buildEstimatedQuote(p.id, fiatAmount, fiatCurrency, now, rates);
    })
    .filter((q): q is OnrampQuoteComparison => q !== null);

  return rankQuotes(entries);
}

/** The top-ranked quote, or null for an empty comparison or when no quote has an available amount. */
export function bestQuote(comparisons: OnrampQuoteComparison[]): OnrampQuoteComparison | null {
  return comparisons.find((q) => q.isBest && q.estimateAvailable) ?? null;
}

/**
- The spread between the best and worst available quote's destination amount.
- Null when fewer than 2 quotes have an available destination amount.
 */
export function quoteSpread(
  comparisons: OnrampQuoteComparison[]
): { absolute: number; percent: number } | null {
  const valid = comparisons.filter((q) => q.estimateAvailable && q.destinationAmount !== "");
  if (valid.length < 2) return null;
  const amounts = valid.map((q) => Number(q.destinationAmount));
  const best = Math.max(...amounts);
  const worst = Math.min(...amounts);
  const absolute = best - worst;
  return { absolute, percent: best > 0 ? (absolute / best) * 100 : 0 };
}

/** Re-derives fee rate as a percentage string for display, e.g. 0.045 -> "4.50%". */
export function formatQuoteFeeRate(providerId: OnrampProvider): string {
  return `${(getProviderFeeRate(providerId) * 100).toFixed(2)}%`;
}