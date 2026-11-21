import { NextResponse } from "next/server";
import {
  simulateBridgeTransaction,
  type SimulatePaymentInput,
  isGAddress,
  isValidStellarAddress,
} from "@/lib/stellar";
import type { StellarNetwork } from "@/lib/types";
import {
  checkRateLimit,
  getClientIp,
} from "@/lib/rateLimit";

/**
 * Transaction simulation endpoint (#478).
 *
 * The bridge flow calls this before presenting the signing step so the user
 * sees the predicted fee, net amount, recipient, and any predicted failure
 * reason before the wallet prompt. It runs server-side because it needs live
 * Horizon account state (balances, current fee) that the client could fetch,
 * but doing it here keeps the prediction logic in one place and keeps network
 * credential/endpoint details out of the client bundle.
 *
 * Always resolves with a {@link SimulationResult}; the pure prediction logic
 * (`simulatePayment`) never throws and the async wrapper reports
 * `simulation_unavailable` instead of failing the request.
 *
 * Rate limited per client IP (#697) so anonymous callers cannot use the
 * server to hammer Horizon.
 */
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

export const MAX_ADDRESS_LENGTH = 56;
export const MAX_AMOUNT_LENGTH = 32;
export const MAX_ASSET_CODE_LENGTH = 12;

export async function POST(request: Request) {
  const limit = checkRateLimit(`simulate:${getClientIp(request)}`, {
    max: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { sourceAddress, destinationAddress, amount, assetCode, network } = body as Record<
    string,
    unknown
  >;

  if (
    typeof sourceAddress !== "string" ||
    typeof destinationAddress !== "string" ||
    typeof amount !== "string" ||
    typeof assetCode !== "string" ||
    (network !== "PUBLIC" && network !== "TESTNET")
  ) {
    return NextResponse.json({ error: "Invalid simulation parameters" }, { status: 400 });
  }

  if (
    sourceAddress.length === 0 ||
    sourceAddress.length > MAX_ADDRESS_LENGTH ||
    destinationAddress.length === 0 ||
    destinationAddress.length > MAX_ADDRESS_LENGTH ||
    amount.length === 0 ||
    amount.length > MAX_AMOUNT_LENGTH ||
    assetCode.length === 0 ||
    assetCode.length > MAX_ASSET_CODE_LENGTH
  ) {
    return NextResponse.json(
      { error: "Parameter exceeds maximum allowed length or is empty" },
      { status: 400 }
    );
  }

  if (!isGAddress(sourceAddress)) {
    return NextResponse.json(
      { error: "Invalid source address: must be a valid G-address" },
      { status: 400 }
    );
  }

  if (!isValidStellarAddress(destinationAddress)) {
    return NextResponse.json(
      { error: "Invalid destination address: must be a valid Stellar address" },
      { status: 400 }
    );
  }

  const input: SimulatePaymentInput = {
    sourceAddress,
    destinationAddress,
    amount,
    assetCode,
  };
  const result = await simulateBridgeTransaction(input, network as StellarNetwork);
  return NextResponse.json(result);
}
