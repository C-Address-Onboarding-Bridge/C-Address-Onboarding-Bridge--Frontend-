import { NextResponse } from "next/server";
import { Horizon } from "@stellar/stellar-sdk";
import { HORIZON_URL, type StellarNetwork } from "@/lib/types";
import { isValidHash, type TransactionConfirmation } from "@/lib/confirmations";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/** Stroops per XLM (1 XLM = 10,000,000 stroops). */
const STROOPS_PER_XLM = 10_000_000;

/** Per-IP rate limit for this public route (#906). */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function formatStroopsAsXlm(stroops: number | string | undefined): string {
  const n = typeof stroops === "string" ? Number(stroops) : stroops;
  const xlm = (typeof n === "number" && Number.isFinite(n) ? n : 0) / STROOPS_PER_XLM;
  return xlm.toFixed(7).replace(/\.?0+$/, "") || "0";
}

/**
 * True when a Horizon SDK error is a 404 (transaction not yet ingested or
 * wrong network). Any other status (5xx, 429, etc.) is an upstream failure
 * that should be reported as 502 — not "not found".
 */
function isHorizonNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: unknown } }).response?.status === "number" &&
    (error as { response: { status: number } }).response.status === 404
  );
}

/**
 * Looks up a transaction on Horizon and maps it to the public
 * TransactionConfirmation shape (#676). Returns:
 * - `{ confirmation }` on success
 * - `{ notFound: true }` when Horizon returns 404
 * - `{ upstreamError: true }` for any other Horizon failure (5xx, 429, network timeout, etc.)
 */
async function lookupConfirmation(
  hash: string,
  network: StellarNetwork
): Promise<
  | { confirmation: TransactionConfirmation }
  | { notFound: true }
  | { upstreamError: true }
> {
  const server = new Horizon.Server(HORIZON_URL[network]);

  let record: Horizon.ServerApi.TransactionRecord;
  try {
    record = await server.transactions().transaction(hash).call();
  } catch (err) {
    if (isHorizonNotFound(err)) return { notFound: true };
    return { upstreamError: true };
  }

  let fromAddress: string | null = null;
  let toAddress: string | null = null;
  let amount: string | null = null;
  let asset: string | null = null;
  try {
    const operations = await server.operations().forTransaction(hash).call();
    const payment = operations.records.find((op) => op.type === "payment");
    if (payment && payment.type === "payment") {
      fromAddress = payment.from ?? null;
      toAddress = payment.to ?? null;
      amount = payment.amount ?? null;
      asset = payment.asset_type === "native" ? "XLM" : (payment.asset_code ?? null);
    }
  } catch {
    // Best-effort — if this fails, fromAddress/etc. stay null and the
    // function reports not-found below (no payment operation to confirm).
  }

  if (!fromAddress || !toAddress || !amount || !asset) return { notFound: true };

  return {
    confirmation: {
      hash: record.hash ?? hash,
      amount,
      asset,
      timestamp: record.created_at ? new Date(record.created_at).getTime() : Date.now(),
      fromAddress,
      toAddress,
      fee: formatStroopsAsXlm(record.fee_charged),
      status: record.successful ? "success" : "failed",
    },
  };
}

export async function GET(request: Request, context: { params: Promise<{ hash: string }> }) {
  // Rate limit first (#906).
  const ip = getClientIp(request);
  const rl = checkRateLimit(`confirmations:${ip}`, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
      }
    );
  }

  const { hash } = await context.params;

  if (!isValidHash(hash)) {
    return NextResponse.json({ error: "Invalid transaction hash format" }, { status: 400 });
  }

  // Validate the network query parameter — reject anything that is not
  // explicitly PUBLIC or TESTNET rather than silently defaulting to TESTNET,
  // which would make a bad URL look like a valid one (#906).
  const networkParam = new URL(request.url).searchParams.get("network");
  if (networkParam !== "PUBLIC" && networkParam !== "TESTNET") {
    return NextResponse.json(
      { error: "Invalid network. Must be PUBLIC or TESTNET." },
      { status: 400 }
    );
  }
  const network: StellarNetwork = networkParam;

  const result = await lookupConfirmation(hash, network);

  if ("upstreamError" in result) {
    return NextResponse.json(
      { error: "Upstream error fetching transaction from Horizon" },
      { status: 502 }
    );
  }

  if ("notFound" in result) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  return NextResponse.json(result.confirmation);
}
