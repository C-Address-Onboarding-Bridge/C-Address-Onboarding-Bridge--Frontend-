const MOONPAY_API_KEY = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
const TRANSAK_API_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY || "";

/**
- Formats a provider's numeric bounds into the `"$min - $max"` display
- string, with thousands separators to match the previous hand-written
- labels (e.g. "$15 - $25,000"). (#940)
 */
function formatLimitsLabel(minAmount: number, maxAmount: number): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  return `${fmt(minAmount)} - ${fmt(maxAmount)}`;
}

// Single source of truth for on-ramp provider id/name/fee/limits/currencies,
// shared by the on-ramp page, `src/lib/onrampQuotes.ts` (#556) and the
// `/api/onramp/quotes` route. Kept in lib/ so none of them depends on UI code (#721).
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

function parseEnvRate(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
- Optional configured USD exchange rates (1 unit of fiat = N USD).
- USD is always 1:1 with USDC; non-USD currencies require either a configured
- rate or a live provider quote so EUR/GBP/INR are never treated 1:1. (#943)
 */
export function getConfiguredFxRates(): Record<string, number> {
  const rates: Record<string, number> = { USD: 1 };
  const envMap: Record<string, string | undefined> = {
    EUR: process.env.NEXT_PUBLIC_FX_RATE_EUR,
    GBP: process.env.NEXT_PUBLIC_FX_RATE_GBP,
    INR: process.env.NEXT_PUBLIC_FX_RATE_INR,
  };
  for (const [code, raw] of Object.entries(envMap)) {
    const parsed = parseEnvRate(raw);
    if (parsed !== null) rates[code] = parsed;
  }
  return rates;
}

/**
- Returns the USD exchange rate (`1 fiat = rate USD`) for `fiatCurrency`,
- or `null` when no rate is configured for a non-USD currency. (#943)
 */
export function getUsdExchangeRate(
  fiatCurrency: string,
  rates: Readonly<Record<string, number>> = getConfiguredFxRates()
): number | null {
  const code = fiatCurrency.toUpperCase();
  if (code === "USD") return 1;
  const rate = rates[code];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
- Converts a provider's USD bounds `[minAmount, maxAmount]` into `fiatCurrency`
- using `rates`, or returns `null` when no rate is available for a non-USD
- currency. (#943)
 */
export function getProviderLimitsForCurrency(
  providerId: string,
  fiatCurrency: string = "USD",
  rates: Readonly<Record<string, number>> = getConfiguredFxRates()
): { min: number; max: number } | null {
  const p = providers.find((provider) => provider.id === providerId);
  if (!p) return null;
  const rate = getUsdExchangeRate(fiatCurrency, rates);
  if (rate === null) return null;
  return {
    min: Number((p.minAmount / rate).toFixed(2)),
    max: Number((p.maxAmount / rate).toFixed(2)),
  };
}

/**
- True when `amount` is a finite number inside the provider's limits expressed
- in `fiatCurrency`. Non-USD currencies without an FX rate cannot be verified
- against USD limits and return `false`. (#940, #943)
 */
export function isWithinProviderLimits(
  amount: number,
  providerId: string,
  fiatCurrency: string = "USD",
  rates: Readonly<Record<string, number>> = getConfiguredFxRates()
): boolean {
  if (!Number.isFinite(amount)) return false;
  const limits = getProviderLimitsForCurrency(providerId, fiatCurrency, rates);
  if (!limits) return false;
  return amount >= limits.min && amount <= limits.max;
}

export function getProviderFeeRate(providerId: string): number {
  return providerId === "moonpay" ? 0.045 : 0.05;
}

export interface OnrampCalculationResult {
  feeRate: number;
  /** Fee in the input fiat currency. */
  fee: number;
  /** Estimated USDC received, or `null` when a non-USD rate is unavailable. (#943) */
  receive: number | null;
  /** USD exchange rate used (`1 fiat = usdRate USD`), or `null` when unavailable. (#943) */
  usdRate: number | null;
  rateAvailable: boolean;
}

export function calculateOnrampFeeAndReceive(
  amount: number,
  providerId: string,
  fiatCurrency: string = "USD",
  rates: Readonly<Record<string, number>> = getConfiguredFxRates()
): OnrampCalculationResult {
  const feeRate = getProviderFeeRate(providerId);
  const fee = amount * feeRate;
  const usdRate = getUsdExchangeRate(fiatCurrency, rates);
  if (usdRate === null) {
    return {
      feeRate,
      fee,
      receive: null,
      usdRate: null,
      rateAvailable: false,
    };
  }
  const usdAmount = amount * usdRate;
  const receive = usdAmount - usdAmount * feeRate;
  return {
    feeRate,
    fee,
    receive,
    usdRate,
    rateAvailable: true,
  };
}