import { NextRequest, NextResponse } from "next/server";
import { providers } from "@/components/routes/onramp-page";
import { isOnrampProvider, type OnrampProvider } from "@/lib/types";
import type { LiveQuoteInput } from "@/lib/onrampQuotes";

/**
 * Optional live on-ramp quote proxy for #556's provider comparison.
 *
 * This repo vendors neither MoonPay's nor Transak's real quote API (their
 * `providers[].baseUrl` in `onramp-page.tsx` is a checkout *widget* URL, not
 * a quote endpoint) — the same "not vendored yet" situation `feeTiers.ts` and
 * `locks.ts` document for their own placeholder integrations. Rather than
 * guess at request/response shapes for APIs this repo has never called, each
 * provider's live lookup is gated behind its own env var
 * (`MOONPAY_QUOTE_API_URL` / `TRANSAK_QUOTE_API_URL`); unset (the default)
 * means that provider is simply omitted from `live`, and the client falls
 * back to its own fee-model estimate via `compareOnrampQuotes` — exactly how
 * `/api/activity` degrades to `[]` when `INDEXER_EVENTS_URL` is unset.
 *
 * Each configured provider is queried independently with `Promise.allSettled`
 * and a per-provider timeout, so one slow or failing provider never blocks or
 * blanks out the others' quotes (#556's "provider-failure isolation"
 * requirement) — always resolves 200 with whatever succeeded.
 */

const QUOTE_TIMEOUT_MS = 5000;

const QUOTE_ENV_URL: Record<OnrampProvider, string | undefined> = {
  moonpay: process.env.MOONPAY_QUOTE_API_URL,
  transak: process.env.TRANSAK_QUOTE_API_URL,
};

function isLiveQuoteShape(value: unknown): value is LiveQuoteInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sourceAmount === "string" &&
    typeof v.destinationAmount === "string" &&
    typeof v.fee === "string"
  );
}

async function fetchLiveQuote(
  providerId: OnrampProvider,
  url: string,
  amount: string,
  currency: string
): Promise<LiveQuoteInput | null> {
  try {
    const res = await fetch(`${url}?amount=${encodeURIComponent(amount)}&currency=${encodeURIComponent(currency)}`, {
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isLiveQuoteShape(data) ? data : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const amount = searchParams.get("amount");
  const currency = searchParams.get("currency") ?? "USD";

  if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json(
      { error: "A positive numeric `amount` query parameter is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const configured = providers.filter(
    (p) => isOnrampProvider(p.id) && QUOTE_ENV_URL[p.id]
  ) as Array<{ id: OnrampProvider }>;

  const settled = await Promise.allSettled(
    configured.map((p) => fetchLiveQuote(p.id, QUOTE_ENV_URL[p.id] as string, amount, currency))
  );

  const live: Partial<Record<OnrampProvider, LiveQuoteInput>> = {};
  settled.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      live[configured[i].id] = result.value;
    }
    // A rejected/failed/timed-out entry is simply absent from `live` — the
    // caller's compareOnrampQuotes() falls back to the local estimate for it.
  });

  return NextResponse.json(
    { live, fetchedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
