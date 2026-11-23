import { NextResponse } from "next/server";
import { isValidContract, isValidEd25519PublicKey } from "@/lib/strkey";

/**
 * Transaction export (#1024).
 *
 * The previous implementation forwarded the caller's query string verbatim to
 * the platform-wide `/api/v1/transactions` list, so any caller could read every
 * account's transactions and the `address`/`from`/`to` filters were silently
 * ignored. This route now:
 *
 *  - requires a valid StrKey `address` and a `network` (400 otherwise),
 *  - forwards only `address`, `network`, `fromDate` and `toDate` (mapped from
 *    `from`/`to`), dropping every other param,
 *  - returns 501 instead of proxying the unscoped list, until an
 *    address-scoped backend export endpoint exists.
 *
 * Ownership proof (signed challenge / SEP-10) is still an open decision; see
 * docs/issues/1024-transaction-export-scoping.md.
 */

const SUPPORTED_NETWORKS = new Set(["TESTNET", "PUBLIC"]);

function badRequest(error: string): Response {
  return NextResponse.json({ error }, { status: 400 });
}

/** Builds the address-scoped backend query, or a 400 response describing why not. */
export function buildExportQuery(searchParams: URLSearchParams): string | Response {
  const address = searchParams.get("address")?.trim() ?? "";
  if (!address) return badRequest("An address is required.");
  if (!isValidEd25519PublicKey(address) && !isValidContract(address)) {
    return badRequest("Address must be a valid Stellar StrKey.");
  }

  const network = searchParams.get("network")?.trim().toUpperCase() ?? "";
  if (!network) return badRequest("A network is required.");
  if (!SUPPORTED_NETWORKS.has(network)) {
    return badRequest("Network must be TESTNET or PUBLIC.");
  }

  const query = new URLSearchParams({ address, network });

  const from = searchParams.get("from");
  if (from) query.set("fromDate", from);
  const to = searchParams.get("to");
  if (to) query.set("toDate", to);

  return query.toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = buildExportQuery(searchParams);
  if (query instanceof Response) return query;

  // No address-scoped backend export endpoint exists yet, so there is nothing
  // safe to proxy to. Returning 501 keeps the platform-wide list unreachable.
  return NextResponse.json(
    {
      error: "Transaction export is not available yet.",
      detail: "An address-scoped backend export endpoint is required before exports can be served.",
      query,
    },
    { status: 501 }
  );
}
