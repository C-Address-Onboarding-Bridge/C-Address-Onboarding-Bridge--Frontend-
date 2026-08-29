import { Horizon } from "@stellar/stellar-sdk";
import {
  HORIZON_URL,
  type BridgeTransactionStatus,
  type StellarNetwork,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** How often the server re-checks Horizon while the tx is still in flight. */
const POLL_INTERVAL_MS = 3_000;
/** Hard cap for a single SSE connection before it closes. */
const MAX_DURATION_MS = 30_000;

interface StatusResponse {
  hash: string;
  network: StellarNetwork;
  status: BridgeTransactionStatus;
  ledger: number | null;
  createdAt: string | null;
}

async function fetchCurrentStatus(
  hash: string,
  network: StellarNetwork
): Promise<StatusResponse> {
  const server = new Horizon.Server(HORIZON_URL[network]);
  try {
    const tx = await server.transactions().transaction(hash).call();
    return {
      hash,
      network,
      status: tx.successful ? "confirmed" : "failed",
      ledger: tx.ledger_attr ?? null,
      createdAt: tx.created_at ?? null,
    };
  } catch {
    // Not on Horizon yet (still in flight) or an invalid hash.
    return { hash, network, status: "pending", ledger: null, createdAt: null };
  }
}

/**
 * Transaction status endpoint (#471).
 *
 * Responds with JSON when the client only accepts JSON (single snapshot) and
 * with a Server-Sent Events stream when the client requests `text/event-stream`
 * (the bridge page's live status feed). The stream closes itself once the
 * transaction reaches a terminal state or after MAX_DURATION_MS.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ hash: string }> }
) {
  const { hash } = await context.params;
  const url = new URL(request.url);
  const network: StellarNetwork =
    url.searchParams.get("network") === "PUBLIC" ? "PUBLIC" : "TESTNET";

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    const payload = await fetchCurrentStatus(hash, network);
    return new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      try {
        // eslint-disable-next-line no-constant-condition
        while (Date.now() - startedAt < MAX_DURATION_MS) {
          const payload = await fetchCurrentStatus(hash, network);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          if (payload.status === "confirmed" || payload.status === "failed") break;
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Stream already closed by the client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
