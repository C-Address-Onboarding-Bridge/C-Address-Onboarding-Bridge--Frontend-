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

/** Per-IP rate limit for this public route (#697). */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { limited: false, retryAfter: 0 };
}

interface StatusResponse {
  hash: string;
  network: StellarNetwork;
  status: BridgeTransactionStatus;
  ledger: number | null;
  createdAt: string | null;
}

/**
 * Horizon returns 404 when the transaction is not (yet) known. Any other
 * failure (network error, 5xx, rate limit) is an upstream problem and must not
 * be reported as `pending`.
 */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: unknown } }).response?.status ===
      "number" &&
    (error as { response: { status: number } }).response.status === 404
  );
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
  } catch (error) {
    if (isNotFound(error)) {
      // Not on Horizon yet (still in flight).
      return { hash, network, status: "pending", ledger: null, createdAt: null };
    }
    throw error;
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Transaction status endpoint (#471).
 *
 * Responds with JSON when the client only accepts JSON (single snapshot) and
 * with a Server-Sent Events stream when the client requests `text/event-stream`
 * (the bridge page's live status feed). The stream closes itself once the
 * transaction reaches a terminal state, after MAX_DURATION_MS, or as soon as
 * the client disconnects.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ hash: string }> }
) {
  const { limited, retryAfter } = checkRateLimit(getClientIp(request));
  if (limited) {
    return new Response(JSON.stringify({ error: "Too Many Requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    });
  }

  const { hash } = await context.params;
  if (!HASH_PATTERN.test(hash)) {
    return jsonError("Invalid transaction hash", 400);
  }

  const url = new URL(request.url);
  const networkParam = url.searchParams.get("network");
  if (
    networkParam !== null &&
    !ALLOWED_NETWORKS.includes(networkParam as StellarNetwork)
  ) {
    return jsonError("Invalid network", 400);
  }
  const network: StellarNetwork = (networkParam as StellarNetwork) ?? "TESTNET";

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    try {
      const payload = await fetchCurrentStatus(hash, network);
      return new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return jsonError("Failed to reach Horizon", 502);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      try {
        // eslint-disable-next-line no-constant-condition
        while (Date.now() - startedAt < MAX_DURATION_MS) {
          if (request.signal.aborted) break;
          let payload: StatusResponse;
          try {
            payload = await fetchCurrentStatus(hash, network);
          } catch {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  error: "Failed to reach Horizon",
                })}\n\n`
              )
            );
            break;
          }
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
