import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { isCAddress } from "@/lib/stellar";
import { truncateAddress, type FundingActivityEvent } from "@/lib/activityFeed";

/**
 * Proxies the indexer's public funding-event API for the landing page feed
 * (#489, #677).
 *
 * This route used to call `${INDEXER_EVENTS_URL}?type=funding&limit=20` and
 * read `toAddress`/`amount` off the top-level object. The indexer
 * (`C-Address-Onboarding-Bridge--Contract/indexer`) serves
 * `GET /api/events/:event_type` and returns `IndexedEvent[]`:
 *
 *   { id, event_type, ledger_sequence, contract_id, tx_hash, timestamp, data }
 *
 * There is no `?type=` filter and no top-level `toAddress`/`amount` -- every
 * event from the old query was silently dropped by the shape check below,
 * which is why the landing-page feed was always empty. Fields of interest
 * live inside `data`, keyed by topic position, since the indexer's own
 * `source`/`target` convenience fields on `data` are populated from the
 * wrong topic indices (see the decodeTopicAddress doc comment below).
 *
 * Always resolves with a 200 and an array (possibly empty): an unreachable
 * or misconfigured indexer, or an event that fails validation, is treated as
 * "no recent activity" for that entry, not an error the landing page needs
 * to surface.
 */

const INDEXER_TIMEOUT_MS = 5000;
const EVENT_LIMIT = 20;

interface IndexedEvent {
  id: string;
  event_type: string;
  timestamp: string;
  data: unknown;
}

function isIndexedEvent(value: unknown): value is IndexedEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.event_type === "string" && typeof v.timestamp === "string";
}

/**
 * Decodes one topic entry from the indexer's `data.topics` array into a
 * Stellar StrKey address.
 *
 * The indexer's minimal XDR decoder (`indexer/src/poller.rs::decode_scval`)
 * renders an `ScVal::Address` as `"scaddress:<kind>:<hex32>"` (kind 0 =
 * account/G-address, kind 1 = contract/C-address) rather than a proper
 * StrKey -- there is no StrKey-encoding step in that decoder. This mirrors
 * that encoding on the read side so the two 32-byte-address topics
 * `fund_c_address` actually emits (asset, target) become usable addresses
 * here. A value that's already a proper StrKey (a future indexer fix) is
 * passed through unchanged, so this keeps working either way.
 */
function decodeTopicAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (StrKey.isValidEd25519PublicKey(raw) || StrKey.isValidContract(raw)) return raw;

  const match = /^scaddress:(\d+):([0-9a-f]{64})$/i.exec(raw);
  if (!match) return null;

  const [, kind, hex] = match;
  const bytes = Buffer.from(hex, "hex");
  if (bytes.length !== 32) return null;

  try {
    if (kind === "0") return StrKey.encodeEd25519PublicKey(bytes);
    if (kind === "1") return StrKey.encodeContract(bytes);
  } catch {
    return null;
  }
  return null;
}

/**
 * Maps one `CAddressFunded` `IndexedEvent` into a `FundingActivityEvent`, or
 * null if any required field fails validation. Every field is validated
 * independently -- a partially-decodable event (e.g. a valid target address
 * but an amount the indexer's decoder couldn't handle) is dropped entirely
 * rather than shown with a fabricated or missing value.
 *
 * `fund_c_address` publishes `("CAddressFunded", asset, source, target)` as
 * its topics and `(amount, fee)` as its data payload (see the contract's own
 * doc comment on that function). The indexer's `data.topics` array preserves
 * this order; `data.value` is whatever `decode_scval` produced for the
 * `(amount, fee)` tuple -- today that decoder doesn't handle the `Vec` ScVal
 * kind a tuple encodes as, so `value` stays an undecoded base64 string and
 * every real event's amount currently fails validation below (tracked
 * separately against the indexer; this mapping is forward-compatible with a
 * fix there: a `[amount, fee]` JSON array, or the amount as a bare number,
 * both validate successfully).
 */
function mapCAddressFunded(event: IndexedEvent): FundingActivityEvent | null {
  if (event.event_type !== "CAddressFunded") return null;
  if (typeof event.data !== "object" || event.data === null) return null;

  const data = event.data as Record<string, unknown>;
  const topics = Array.isArray(data.topics) ? data.topics : null;
  if (!topics || topics.length < 4) return null;

  const target = decodeTopicAddress(topics[3]);
  if (!target || !isCAddress(target)) return null;

  const asset = decodeTopicAddress(topics[1]);
  if (!asset) return null;

  const rawAmount = Array.isArray(data.value) ? data.value[0] : data.value;
  if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount) || rawAmount <= 0) return null;

  const timestampMs = Date.parse(event.timestamp);
  if (!Number.isFinite(timestampMs)) return null;

  return {
    id: event.id,
    address: truncateAddress(target),
    amount: String(rawAmount),
    asset,
    timestamp: timestampMs,
  };
}

export async function GET() {
  const indexerUrl = process.env.INDEXER_EVENTS_URL;
  if (!indexerUrl) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const url = `${indexerUrl.replace(/\/$/, "")}/CAddressFunded?limit=${EVENT_LIMIT}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(INDEXER_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Indexer returned ${res.status}`);

    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("Indexer returned an unexpected shape");

    const events: FundingActivityEvent[] = data
      .filter(isIndexedEvent)
      .map(mapCAddressFunded)
      .filter((e): e is FundingActivityEvent => e !== null);

    return NextResponse.json(events, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }
}
