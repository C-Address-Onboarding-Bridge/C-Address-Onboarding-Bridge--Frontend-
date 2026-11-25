import { NextResponse } from "next/server";
import { Horizon } from "@stellar/stellar-sdk";
import { HORIZON_URL, STELLAR_NETWORK, type StellarNetwork } from "@/lib/types";
import { isValidHash } from "@/lib/confirmations";
import { extractTransferFromOps } from "@/lib/operationTransfer";

/** Stroops per XLM (1 XLM = 10,000,000 stroops). */
const STROOPS_PER_XLM = 10_000_000;

/** Public receipt shape rendered by /receipt/[hash]. */
export interface Receipt {
  hash: string;
  amount: string;
  fee: string;
  net: string;
  asset: string;
  from: { label: string; address: string };
  to: { label: string; address: string };
  timestamp: string;
}

function formatStroopsAsXlm(stroops: number | string | undefined): string {
  const n = typeof stroops === "string" ? Number(stroops) : stroops;
  const xlm = (typeof n === "number" && Number.isFinite(n) ? n : 0) / STROOPS_PER_XLM;
  return xlm.toFixed(7).replace(/\.?0+$/, "") || "0";
}

function subtractAmounts(amount: string, fee: string): string {
  const a = Number(amount);
  const f = Number(fee);
  if (!Number.isFinite(a) || !Number.isFinite(f)) return amount;
  return (a - f).toFixed(7).replace(/\.?0+$/, "") || "0";
}

function isHorizonNotFound(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status === 404;
}

/**
 * Looks up a transaction on Horizon and maps it to the public Receipt shape.
 * Returns `null` only when Horizon reports the transaction does not exist;
 * any other Horizon failure is rethrown so the caller can answer 502.
 */
async function lookupReceipt(hash: string, network: StellarNetwork): Promise<Receipt | null> {
  const server = new Horizon.Server(HORIZON_URL[network]);

  let record: Horizon.ServerApi.TransactionRecord;
  try {
    record = await server.transactions().transaction(hash).call();
  } catch (err) {
    if (isHorizonNotFound(err)) return null;
    throw err;
  }

  const operations = await server.operations().forTransaction(hash).call();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transfer = extractTransferFromOps(operations.records as any[]);
  if (!transfer) return null;

  const fee = formatStroopsAsXlm(record.fee_charged);

  return {
    hash: record.hash ?? hash,
    amount: transfer.amount,
    fee,
    net: subtractAmounts(transfer.amount, fee),
    asset: transfer.asset,
    from: { label: "From", address: transfer.fromAddress },
    to: { label: "To", address: transfer.toAddress },
    timestamp: record.created_at ? new Date(record.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function GET(request: Request, context: { params: Promise<{ hash: string }> }) {
  const { hash } = await context.params;

  if (!isValidHash(hash)) {
    return NextResponse.json({ error: "Invalid transaction hash format" }, { status: 400 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("network");
  if (requested !== null && !(requested in STELLAR_NETWORK)) {
    return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
  }
  const network: StellarNetwork = requested === "PUBLIC" ? "PUBLIC" : "TESTNET";

  try {
    const receipt = await lookupReceipt(hash, network);
    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    return NextResponse.json(receipt);
  } catch {
    return NextResponse.json({ error: "Failed to load receipt from Horizon" }, { status: 502 });
  }
}
