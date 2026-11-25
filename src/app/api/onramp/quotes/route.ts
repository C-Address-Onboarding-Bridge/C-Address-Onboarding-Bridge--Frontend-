import { NextRequest, NextResponse } from "next/server";
import { providers } from "@/lib/onrampProviders";
import { isOnrampProvider, type OnrampProvider } from "@/lib/types";
import type { LiveQuoteInput } from "@/lib/onrampQuotes";
import { isCAddress } from "@/lib/stellar";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Live on-ramp quote proxy for #556's provider comparison, backed by the
 * backend's aggregated quote endpoint (#678).
 *
 * This route never calls MoonPay or Transak directly: it forwards
 * `amount`/`currency`/`cAddress` to the backend's `/api/v1/offramp/quote`
 * endpoint, which aggregates the per-provider quotes. The backend requires an
 * `X-API-Key` header, so this route is server-side only and reads:
 *
 * - `NEXT_PUBLIC_API_URL` — base URL of the backend. Unset means no backend
 *   call is made and the route degrades to `{ live: {} }`.
 * - `BACKEND_API_KEY` — server-only API key sent as `X-API-Key`. Never expose
 *   it with a `NEXT_PUBLIC_` prefix. Unset means no backend call is made.
 *
 * Because every anonymous request would otherwise spend the server's
 * `BACKEND_API_KEY`, the route is rate limited per client IP (#1018) and
 * short-caches identical `(amount, currency, cAddress)` lookups. `currency`
 * is validated against the providers' supported currencies and `amount` is
 * capped at the largest provider maximum before any backend call.
 *
 * The backend's quote endpoint requires a destination `cAddress` (Zod
 * `STELLAR_ADDRESS_REGEX`-validated) alongside the amount/currency, which
 * isn't always known yet -- the comparison panel that calls this route can
 * render before the user has entered a valid address. `cAddress` is
 * therefore optional here: without it (or without NEXT_PUBLIC_API_URL /
 * BACKEND_API_KEY configured, or on any backend failure/timeout/malformed
 * response), this degrades to `{ live: {} }`, and the client's own estimate
 * stands in -- already labelled "Estimated" vs "Live" in the comparison
 * panel.
 */

const QUOTE_TIMEOUT_MS = 5000;

/** Per-IP rate limit: anonymous callers must not drain the backend API key. */
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Short cache for identical lookups, so repeated renders don't re-hit the backend. */
const QUOTE_CACHE_TTL_MS = 15_000;
const QUOTE_CACHE_MAX_ENTRIES = 200;

/** Currencies any provider accepts, upper-cased. */
const SUPPORTED_CURRENCIES = new Set(
  providers.flatMap((p) => p.currencies.map((c) => c.toUpperCase()))
);

/** Largest amount any provider accepts; anything above is rejected. */
const MAX_AMOUNT = Math.max(...providers.map((p) => p.maxAmount));

interface CachedQuotes {
  live: Partial<Record<OnrampProvider, LiveQuoteInput>>;
  expiresAt: number;
}

const quoteCache = new Map<string, CachedQuotes>();

function readCache(key: string): Partial<Record<OnrampProvider, LiveQuoteInput>> | null {
  const entry = quoteCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    quoteCache.delete(key);
    return null;
  }
  return entry.live;
}

function writeCache(
  key: string,
  live: Partial<Record<OnrampProvider, LiveQuoteInput>>
): void {
  if (quoteCache.size >= QUOTE_CACHE_MAX_ENTRIES) {
    const oldest = quoteCache.keys().next().value;
    if (oldest !== undefined) quoteCache.delete(oldest);
  }
  quoteCache.set(key, { live, expiresAt: Date.now() + QUOTE_CACHE_TTL_MS });
}

/** This app only on-ramps into USDC (see onrampQuotes.ts's doc comment). */
const CRYPTO_CURRENCY = "usdc";

interface BackendProviderQuote {
  provider: string;
  fiatAmount: number;
  cryptoAmount: number;
  feeAmount: number;
  netAmount: number;
  estimatedRate: number;
}

function isBackendProviderQuote(value: unknown): value is BackendProviderQuote {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === "string" &&
    Number.isFinite(v.fiatAmount) &&
    Number.isFinite(v.cryptoAmount) &&
    Number.isFinite(v.feeAmount) &&
    Number.isFinite(v.netAmount)
  );
}

/** Maps one backend ProviderQuote onto the shape compareOnrampQuotes expects. */
function toLiveQuoteInput(q: BackendProviderQuote): LiveQuoteInput {
  return {
    sourceAmount: q.fiatAmount.toFixed(2),
    destinationAmount: q.netAmount.toFixed(2),
    fee: q.feeAmount.toFixed(2),
  };
}

async function fetchBackendComparison(
  amount: string,
  currency: string,
  cAddress: string
): Promise<Partial<Record<OnrampProvider, LiveQuoteInput>>> {
  const live: Partial<Record<OnrampProvider, LiveQuoteInput>> = {};
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBaseUrl) return live;

  // The backend requires X-API-Key on every route except /health. Read it
  // server-side only (no NEXT_PUBLIC_ prefix) and degrade to the client-side
  // estimate when it is not configured.
  const apiKey = process.env.BACKEND_API_KEY;
  if (!apiKey) return live;

  try {
    const url = new URL("/api/v1/offramp/quote", apiBaseUrl);
    url.searchParams.set("fiatAmount", amount);
    url.searchParams.set("fiatCurrency", currency);
    url.searchParams.set("cryptoCurrency", CRYPTO_CURRENCY);
    url.searchParams.set("cAddress", cAddress);

    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    });
    if (!res.ok) return live;

    const data: unknown = await res.json();
    const comparison = (data as { comparison?: unknown }).comparison;
    if (!Array.isArray(comparison)) return live;

    for (const entry of comparison) {
      if (isBackendProviderQuote(entry) && isOnrampProvider(entry.provider)) {
        live[entry.provider] = toLiveQuoteInput(entry);
      }
    }
  } catch {
    // Network error, timeout, or bad JSON: return whatever (if anything) was
    // already populated -- the client's estimate covers the rest.
  }

  return live;
}

export async function GET(request: NextRequest) {
  const limit = checkRateLimit(`onramp-quotes:${getClientIp(request)}`, {
    max: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds ?? 60),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const amount = searchParams.get("amount");
  const currency = (searchParams.get("currency") ?? "USD").toUpperCase();
  const cAddress = searchParams.get("cAddress");

  if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json(
      { error: "A positive numeric `amount` query parameter is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!SUPPORTED_CURRENCIES.has(currency)) {
    return NextResponse.json(
      {
        error: `Unsupported \`currency\`. Supported: ${[...SUPPORTED_CURRENCIES].join(", ")}.`,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (Number(amount) > MAX_AMOUNT) {
    return NextResponse.json(
      { error: `\`amount\` must not exceed ${MAX_AMOUNT}.` },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  let live: Partial<Record<OnrampProvider, LiveQuoteInput>> = {};
  if (cAddress && isCAddress(cAddress)) {
    const cacheKey = `${amount}:${currency}:${cAddress}`;
    const cached = readCache(cacheKey);
    if (cached) {
      live = cached;
    } else {
      live = await fetchBackendComparison(amount, currency, cAddress);
      writeCache(cacheKey, live);
    }
  }

  return NextResponse.json(
    { live, fetchedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
