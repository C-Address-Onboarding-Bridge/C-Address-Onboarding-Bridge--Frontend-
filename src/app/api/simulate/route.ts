import { NextResponse } from "next/server";
import {
  simulateBridgeTransaction,
  type SimulatePaymentInput,
} from "@/lib/stellar";
import type { StellarNetwork } from "@/lib/types";

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
 */
export async function POST(request: Request) {
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

  const input: SimulatePaymentInput = {
    sourceAddress,
    destinationAddress,
    amount,
    assetCode,
  };
  const result = await simulateBridgeTransaction(input, network as StellarNetwork);
  return NextResponse.json(result);
}
