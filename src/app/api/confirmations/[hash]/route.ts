import { NextResponse } from "next/server";
import { Horizon } from "@stellar/stellar-sdk";
import { HORIZON_URL, type StellarNetwork } from "@/lib/types";
import { isValidHash, type TransactionConfirmation } from "@/lib/confirmations";
import { extractTransferFromOps } from "@/lib/operationTransfer";
import { extractTransferFromOps } from "@/lib/stellar";

/** Stroops per XLM (1 XLM = 10,000,000 stroops). */
const STROOPS_PER_XLM = 10_000_000;

function formatStroopsAsXlm(stroops: number | string | undefined): string {
  const n = typeof stroops === "string" ? Number(stroops) : stroops;
  const xlm = (typeof n === "number" && Number.isFinite(n) ? n : 0) / STROOPS_PER_XLM;
  return xlm.toFixed(7).replace(/\.?0+$/, "") || "0";
}

/**
 * Looks up a transaction on Horizon and maps it to the public
 * TransactionConfirmation shape (#676). A share link is only meaningful for
 * a transaction Horizon has already ingested and that actually contains a
 * payment — a hash Horizon doesn't know about (still in flight, wrong
 * network, or never existed) and a transaction with no payment operation
 * (nothing to confirm) both resolve to `null`, distinct from the malformed-
 * hash case the caller checks before this ever runs.
 */
async function lookupConfirmation(hash: string, network: StellarNetwork): Promise<TransactionConfirmation | null> {
  const server = new Horizon.Server(HORIZON_URL[network]);

  let record: Horizon.ServerApi.TransactionRecord;
  try {
    record = await server.transactions().transaction(hash).call();
  } catch {
    return null;
  }

  let fromAddress: string | null = null;
  let toAddress: string | null = null;
  let amount: string | null = null;
  let asset: string | null = null;
  try {
    const operations = await server.operations().forTransaction(hash).call();
    // Cast to the HorizonPayment-compatible shape; all fields used by
    // extractTransferFromOps are present on every Horizon operation record.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transfer = extractTransferFromOps(operations.records as any[]);
    if (transfer) {
      fromAddress = transfer.fromAddress;
      toAddress = transfer.toAddress;
      amount = transfer.amount;
      asset = transfer.asset;
    }
  } catch {
    // Best-effort — if this fails, fromAddress/etc. stay null and the
    // function reports not-found below, same as "no payment operation".
  }

  if (!fromAddress || !toAddress || !amount || !asset) return null;

  return {
    hash: record.hash ?? hash,
    amount,
    asset,
    timestamp: record.created_at ? new Date(record.created_at).getTime() : Date.now(),
    fromAddress,
    toAddress,
    fee: formatStroopsAsXlm(record.fee_charged),
    status: record.successful ? "success" : "failed",
  };
}

export async function GET(request: Request, context: { params: Promise<{ hash: string }> }) {
  const { hash } = await context.params;

  if (!isValidHash(hash)) {
    return NextResponse.json({ error: "Invalid transaction hash format" }, { status: 400 });
  }

  const url = new URL(request.url);
  const network: StellarNetwork = url.searchParams.get("network") === "PUBLIC" ? "PUBLIC" : "TESTNET";

  const confirmation = await lookupConfirmation(hash, network);
  if (!confirmation) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  return NextResponse.json(confirmation);
}
