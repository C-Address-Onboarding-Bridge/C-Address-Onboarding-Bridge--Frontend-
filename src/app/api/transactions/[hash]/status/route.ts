import { Horizon } from "@stellar/stellar-sdk";
import {
  HORIZON_URL,
  type BridgeTransactionStatus,
  type StellarNetwork,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const HASH_PATTERN = /^[0-9a-fA-F]{64}$/;
const ALLOWED_NETWORKS: StellarNetwork[] = ["PUBLIC", "TESTNET"];

/** How often the server re-checks Horizon while the tx is still in flight. */
const POLL_INTERVAL_MS = 3_000;
/** Hard cap for a single SSE connection before emitting `event: timeout` and closing. */
const MAX_DURATION_MS = 30_000;

/** Per-IP rate limit for this public route (#697). */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 60_000;

// Periodically clean up expired entries to prevent unbounded memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      // Evict entries older than 5 minutes (enough time for multiple windows)
      if (entry.resetAt + 5 * 60_000 < now) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Use the rightmost (last) entry: the most recent proxy's IP, which we trust.
    // The leftmost entry (client's claim) is untrusted and can be forged to bypass limits.
    const parts = forwarded.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
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
 * transaction reaches a terminal state, emits `event: timeout` after
 * MAX_DURATION_MS so the client can reconnect seamlessly, or stops immediately
 * when the client disconnects. (#952)
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
  let streamCancelled = false;
  let wakeSleep: (() => void) | null = null;

  const abortStream = () => {
    streamCancelled = true;
    if (wakeSleep) {
      const resolve = wakeSleep;
      wakeSleep = null;
      resolve();
    }
  };

  request.signal.addEventListener("abort", abortStream, { once: true });

  const waitWithAbort = (ms: number) =>
    new Promise<void>((resolve) => {
      if (streamCancelled || request.signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        wakeSleep = null;
        resolve();
      }, ms);
      wakeSleep = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let reachedTerminalState = false;

      const safeEnqueue = (chunk: string): boolean => {
        if (streamCancelled || request.signal.aborted) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          streamCancelled = true;
          return false;
        }
      };

      try {
        while (!streamCancelled && !request.signal.aborted && Date.now() - startedAt < MAX_DURATION_MS) {
          let payload: StatusResponse;
          try {
            payload = await fetchCurrentStatus(hash, network);
          } catch {
            safeEnqueue(
              `event: error\ndata: ${JSON.stringify({
                error: "Failed to reach Horizon",
              })}\n\n`
            );
            reachedTerminalState = true;
            break;
          }
          if (streamCancelled || request.signal.aborted) break;
          if (!safeEnqueue(`data: ${JSON.stringify(payload)}\n\n`)) break;
          if (payload.status === "confirmed" || payload.status === "failed") {
            reachedTerminalState = true;
            break;
          }
          await waitWithAbort(POLL_INTERVAL_MS);
        }

        // Notify the client that the 30s stream window elapsed so it can
        // reconnect over SSE rather than treating the close as a fatal error. (#952)
        if (!reachedTerminalState && !streamCancelled && !request.signal.aborted) {
          safeEnqueue(`event: timeout\ndata: ${JSON.stringify({ reason: "stream_timeout" })}\n\n`);
        }
      } finally {
        request.signal.removeEventListener("abort", abortStream);
        try {
          controller.close();
        } catch {
          // Stream already closed by the client.
        }
      }
    },
    cancel() {
      abortStream();
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