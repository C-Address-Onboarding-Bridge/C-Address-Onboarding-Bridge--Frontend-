const MOONPAY_API_KEY = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
const TRANSAK_API_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY || "";

/**
 * Formats a provider's numeric bounds into the `"$min - $max"` display
 * string, with thousands separators to match the previous hand-written
 * labels (e.g. "$15 - $25,000"). (#940)
 */
function formatLimitsLabel(minAmount: number, maxAmount: number): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  return `${fmt(minAmount)} - ${fmt(maxAmount)}`;
}

/**
 * Formats a provider's numeric fee rate into the percentage display
 * string (e.g. 0.045 -> "4.5%", 0.05 -> "5%"). (#1105)
 */
export function formatFeeLabel(feeRate: number): string {
  const pct = Number((feeRate * 100).toFixed(4));
  return `${pct}%`;
}

// Single source of truth for on-ramp provider id/name/fee/limits/currencies,
// shared by the on-ramp page, `src/lib/onrampQuotes.ts` (#556) and the
// `/api/onramp/quotes` route. Kept in lib/ so none of them depends on UI code (#721).
//
// `feeRate` is the actual enforced fee multiplier (#1105) — `fee` is only its
// derived display string. Previously `getProviderFeeRate` hard-coded rates,
// causing label and calculation drift.
//
// `minAmount`/`maxAmount` are the actual enforced bounds (#940) — `limits` is
// only their derived display string. Previously `limits` was a hand-written
// string with no numeric counterpart, so the UI could show "$20 - $10,000"
// while still accepting $0.
export const providers = [
  {
    id: "moonpay",
    name: "Moonpay",
    description: "Buy with credit/debit card",
    feeRate: 0.045,
    fee: formatFeeLabel(0.045),
    minAmount: 20,
    maxAmount: 10_000,
    limits: formatLimitsLabel(20, 10_000),
    currencies: ["USD", "EUR", "GBP"],
    supported: true,
    apiKey: MOONPAY_API_KEY,
    baseUrl: "https://buy.moonpay.com",
  },
  {
    id: "transak",
    name: "Transak",
    description: "Buy with card, Apple Pay, Google Pay",
    feeRate: 0.05,
    fee: formatFeeLabel(0.05),
    minAmount: 15,
    maxAmount: 25_000,
    limits: formatLimitsLabel(15, 25_000),
    currencies: ["USD", "EUR", "GBP", "INR"],
    supported: true,
    apiKey: TRANSAK_API_KEY,
    baseUrl: "https://global.transak.com",
  },
];

/**
 * True when `amount` is a finite number inside `[provider.minAmount,
 * provider.maxAmount]`. Zero, negative, non-numeric and out-of-range amounts
 * are all rejected here instead of only being flagged for display. (#940)
 */
export function isWithinProviderLimits(amount: number, providerId: string): boolean {
  const p = providers.find((provider) => provider.id === providerId);
  if (!p) return false;
  return Number.isFinite(amount) && amount >= p.minAmount && amount <= p.maxAmount;
}

/**
 * Returns the numeric fee rate configured for a provider in the providers table (#1105).
 * Throws for unknown provider ids instead of defaulting to an arbitrary rate.
 */
export function getProviderFeeRate(providerId: string): number {
  const p = providers.find((provider) => provider.id === providerId);
  if (!p) {
    throw new Error(`Unknown onramp provider: ${providerId}`);
  }
  return p.feeRate;
}

export function calculateOnrampFeeAndReceive(amount: number, providerId: string) {
  let feeRate: number;
  try {
    feeRate = getProviderFeeRate(providerId);
  } catch {
    return { feeRate: NaN, fee: NaN, receive: NaN };
  }
  const fee = amount * feeRate;
  const receive = amount - fee;
  return { feeRate, fee, receive };
}
