/**
 * Per-IP rate limiting for the backend proxy routes (#674).
 *
 * In-memory, fixed-window counter. This is intentionally simple — no shared
 * store (Redis, etc.) is configured anywhere in this repo, and a single
 * Node.js server process is the deployment this app otherwise assumes (see
 * src/lib/sequenceManager.ts's own in-memory cache for the same reasoning).
 * On a multi-instance deployment each instance enforces its own limit
 * independently, which is a weaker guarantee than a shared store but still
 * meaningfully caps abuse per instance; documented in README.md alongside
 * the new env vars this feature introduces.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry, present only when `allowed` is false. */
  retryAfterSeconds?: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/** Test-only: clears all counters so tests don't leak state into each other. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Records one request against `key` and reports whether it's within the
 * limit. `key` should already include whatever scope the caller wants rate
 * limited independently (e.g. `${route}:${ip}`) — this function has no
 * notion of routes or IPs on its own.
 */
export function checkRateLimit(
  key: string,
  options: { windowMs?: number; max?: number } = {}
): RateLimitResult {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 30;
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.windowStart + windowMs - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}

/**
 * Best-effort client IP extraction for a Next.js route handler's Request.
 * `x-forwarded-for` may carry a comma-separated chain through multiple
 * proxies — the first entry is the original client. Falls back to a shared
 * "unknown" bucket (rather than throwing) when neither header is present,
 * e.g. in local dev with no proxy in front — every unidentified caller then
 * shares one limit rather than each getting an unlimited allowance.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
