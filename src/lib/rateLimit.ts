/**
 * Minimal in-memory fixed-window rate limiter for public API routes.
 *
 * This is intentionally dependency-free. It is per-process, which is
 * sufficient to stop a single caller from hammering Horizon through the
 * app's server. For multi-instance deployments a shared store (e.g. Redis)
 * can be swapped in behind the same interface.
 */

export interface RateLimitResult {
  /** Whether the request is allowed under the current window. */
  allowed: boolean;
  /** Remaining requests in the current window (never negative). */
  remaining: number;
  /** Seconds until the window resets; used for the Retry-After header. */
  retryAfter: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

/**
 * Best-effort extraction of the caller IP from proxy headers, falling back
 * to a stable placeholder when no header is present (e.g. in tests).
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Fixed-window rate limit check.
 *
 * @param key      Unique bucket key (typically `route:ip`).
 * @param limit    Max requests allowed per window.
 * @param windowMs Window length in milliseconds.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    retryAfter: 0,
  };
}

/** Test helper: clear all buckets between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
