import { NextResponse } from "next/server";
import { truncateAddress, type FundingActivityEvent } from "@/lib/activityFeed";

/**
 * Proxies the indexer's public funding-event API for the landing page feed
 * (#489). Kept server-side (rather than having the browser call the indexer
 * directly) so the indexer's base URL/credentials are never in client JS,
 * and so every address is truncated here — before the response ever leaves
 * the server — instead of relying on the client to redact it.
 *
 * Always resolves with a 200 and an array (possibly empty): an unreachable
 * or misconfigured indexer is treated as "no recent activity", not an error
 * the landing page needs to surface.
 */
export async function GET() {
  const indexerUrl = process.env.INDEXER_EVENTS_URL;
  if (!indexerUrl) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const res = await fetch(`${indexerUrl}?type=funding&limit=20`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Indexer returned ${res.status}`);

    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("Indexer returned an unexpected shape");

    const events: FundingActivityEvent[] = data
      .filter(
        (e): e is { id: string; toAddress: string; amount: string; asset: string; timestamp: number } =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as Record<string, unknown>).toAddress === "string" &&
          typeof (e as Record<string, unknown>).amount === "string"
      )
      .map((e) => ({
        id: e.id,
        address: truncateAddress(e.toAddress),
        amount: e.amount,
        asset: e.asset,
        timestamp: e.timestamp,
      }));

    return NextResponse.json(events, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }
}
