import { NextRequest, NextResponse } from "next/server";
import { isCAddress } from "@/lib/stellar";
import { isOnrampProvider, type OnrampProvider } from "@/lib/types";
import type { LiveQuoteInput } from "@/lib/onrampQuotes";

/**
 * Live on-ramp quote proxy for #556's provider comparison, backed by the
 * backend's aggregated quote endpoint (#678).
 *
 * This route used to fetch MOONPAY_QUOTE_API_URL/TRANSAK_QUOTE_API_URL
 * directly and expected a bespoke `{ sourceAmount, destinationAmount, fee }`
 * shape that neither provider's real API returns -- so every live fetch
 * failed (silently: the route degraded to `{ live: {} }` on any fetch
 * error) and every quote shown was the client's own "estimated" fallback.
 * The backend already exposes `GET /api/v1/offramp/quote`, which calls both
 * providers and returns a ranked comparison; this route proxies to it
 * through NEXT_PUBLIC_API_URL (the same backend base URL `lib/api.ts` uses
 * for health checks) and maps its response into the shape
 * `compareOnrampQuotes` expects.
 *
 * The backend's quote endpoint requires a destination `cAddress` (Zod
 * `STELLAR_ADDRESS_REGEX`-validated) alongside the amount/currency, which
 * isn't always known yet -- the comparison panel that calls this route can
 * render before the user has entered a valid address. `cAddress` is
 * therefore optional here: without it (or without NEXT_PUBLIC_API_URL
 * configured, or on any backend failure/timeout/malformed response), this
 * degrades to `{ live: {} }` exactly as before, and the client's own
 * estimate stands in -- already labelled "Estimated" vs "Live" in the
 * comparison panel, satisfying the "label it clearly" requirement without
 * needing a UI change here.
 */

const QUOTE_TIMEOUT_MS = 5000;

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

  try {
    const url = new URL("/api/v1/offramp/quote", apiBaseUrl);
    url.searchParams.set("fiatAmount", amount);
    url.searchParams.set("fiatCurrency", currency);
    url.searchParams.set("cryptoCurrency", CRYPTO_CURRENCY);
    url.searchParams.set("cAddress", cAddress);

    const res = await fetch(url, { signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });
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
  const { searchParams } = new URL(request.url);
  const amount = searchParams.get("amount");
  const currency = searchParams.get("currency") ?? "USD";
  const cAddress = searchParams.get("cAddress");

  if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json(
      { error: "A positive numeric `amount` query parameter is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const live =
    cAddress && isCAddress(cAddress)
      ? await fetchBackendComparison(amount, currency, cAddress)
      : {};

  return NextResponse.json(
    { live, fetchedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
