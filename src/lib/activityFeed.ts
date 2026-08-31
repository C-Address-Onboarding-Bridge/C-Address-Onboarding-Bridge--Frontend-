/**
 * Anonymised funding-event feed for the landing page (#489).
 *
 * Only an amount, an asset code, a truncated destination address and a
 * timestamp are ever carried — no full address, no source/from address, and
 * no memo or transaction hash. A full address or a from/to pair would let a
 * visitor correlate an entry back to a specific account; truncating to
 * "GABCD…WXYZ" and dropping the source keeps the feed illustrative without
 * being identifying.
 */
export interface FundingActivityEvent {
  id: string;
  /** Already truncated server-side — see truncateAddress. */
  address: string;
  amount: string;
  asset: string;
  timestamp: number;
}

/** Shortens an address for display: GABCDEFG…WXYZ. Never send the full value to the client. */
export function truncateAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 8)}…${address.slice(-4)}`
    : address;
}

const ACTIVITY_ENDPOINT = '/api/activity';

/**
 * Fetches recent funding events for display. Sourced from our own `/api/activity`
 * route, which itself proxies the indexer's public event API server-side (so the
 * indexer URL and any auth are never exposed to the browser). Never throws —
 * callers should treat a failure the same as "no recent activity" and show the
 * empty state rather than an error.
 */
export async function fetchRecentActivity(): Promise<FundingActivityEvent[]> {
  try {
    const res = await fetch(ACTIVITY_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as FundingActivityEvent[]) : [];
  } catch {
    return [];
  }
}
