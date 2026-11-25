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

// Single source of truth for on-ramp provider id/name/fee/limits/currencies,
// shared by the on-ramp page, `src/lib/onrampQuotes.ts` (#556) and the
// `/api/onramp/quotes` route. Kept in lib/ so none of them depends on UI code (#721).
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
    fee: "4.5%",
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
    fee: "5%",
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

export function getProviderFeeRate(providerId: string): number {
  return providerId === "moonpay" ? 0.045 : 0.05;
}

export function calculateOnrampFeeAndReceive(amount: number, providerId: string) {
  const feeRate = getProviderFeeRate(providerId);
  const fee = amount * feeRate;
  const receive = amount - fee;
  return { feeRate, fee, receive };
}
