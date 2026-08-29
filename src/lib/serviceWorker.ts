/**
 * Service Worker support module. (#345)
 *
 * The runtime worker itself lives at `public/sw.js` — it has to be a plain,
 * separately-served script, so it can't import from `src/`. Everything in this
 * module is the *decision logic* that worker follows, kept here as pure,
 * testable functions plus the shared constants. `src/__tests__/serviceWorker.test.ts`
 * unit-tests these functions and asserts that `public/sw.js` still agrees with
 * the constants below, so the two can't silently drift apart.
 *
 * Registration is opt-in via `NEXT_PUBLIC_ENABLE_SW=true`. A cached shell that
 * outlives a deploy is worse than no cache at all for a bridge UI, so the
 * default is off and the worker is versioned + self-cleaning when enabled.
 */

/** Bumping this invalidates every previously stored cache entry. */
export const SW_CACHE_VERSION = "v1";

/** All caches this app owns start with this prefix; stale ones are deleted on activate. */
export const SW_CACHE_PREFIX = "c-address-bridge-";

/** The one cache name the current worker version reads from and writes to. */
export const SW_CACHE_NAME = `${SW_CACHE_PREFIX}${SW_CACHE_VERSION}`;

/** Path the worker script is served from (must be at the scope root). */
export const SW_SCRIPT_URL = "/sw.js";

/** Registration scope — the whole app. */
export const SW_SCOPE = "/";

/**
 * Origins that must never be read from or written to the cache: Stellar
 * network data is consensus state, and serving a stale balance or sequence
 * number would make the app build invalid transactions.
 */
export const NEVER_CACHE_ORIGINS: readonly string[] = [
  "https://horizon.stellar.org",
  "https://horizon-testnet.stellar.org",
  "https://soroban-testnet.stellar.org",
];

/** Extensions safe to serve cache-first — content-hashed or immutable static assets. */
export const CACHEABLE_EXTENSIONS: readonly string[] = [
  ".css",
  ".ico",
  ".jpg",
  ".jpeg",
  ".js",
  ".png",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
];

/** How the worker should fetch a given request. */
export type CacheStrategy = "cache-first" | "network-first" | "network-only";

/** The subset of `Request` the routing logic needs — keeps these functions testable in Node. */
export interface RequestLike {
  url: string;
  method?: string;
  mode?: string;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * True when a request must go straight to the network and never touch the cache.
 *
 * Bypassed: anything that isn't a GET (mutations are never replayable), any
 * Stellar RPC/Horizon origin, non-http(s) schemes such as `chrome-extension:`
 * (the Cache API rejects them outright), and anything under `/api/`, which is
 * request-specific and may carry user data.
 */
export function shouldBypassCache(request: RequestLike): boolean {
  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET") return true;

  const url = parseUrl(request.url);
  if (!url) return true;

  if (url.protocol !== "http:" && url.protocol !== "https:") return true;

  if (NEVER_CACHE_ORIGINS.some((origin) => request.url.startsWith(origin))) return true;

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return true;

  return false;
}

/** True when the pathname points at a static asset that is safe to serve cache-first. */
export function isCacheableAsset(pathname: string): boolean {
  throw new Error('Not implemented: isCacheableAsset');
}

/**
 * Picks the fetch strategy for a request:
 *
 * - `network-only` — anything {@link shouldBypassCache} rejects, plus cross-origin requests
 * - `cache-first`  — same-origin static assets ({@link isCacheableAsset})
 * - `network-first`— everything else (navigations and same-origin documents), so a
 *   fresh deploy always wins when the network is available, with the cache as a
 *   pure offline fallback
 */
export function cacheStrategyFor(request: RequestLike, origin: string): CacheStrategy {
  throw new Error('Not implemented: cacheStrategyFor');
}

/** True for caches this app owns from an older worker version — deleted on activate. */
export function isStaleCache(cacheName: string): boolean {
  throw new Error('Not implemented: isStaleCache');
}

/** Only responses that are OK, basic (same-origin) and non-partial are worth storing. */
export function isCacheableResponse(response: {
  ok?: boolean;
  status?: number;
  type?: string;
} | null | undefined): boolean {
  throw new Error('Not implemented: isCacheableResponse');
}

/** Registration is opt-in, so a stale cached shell can never surprise a deploy. */
export function isServiceWorkerEnabled(): boolean {
  throw new Error('Not implemented: isServiceWorkerEnabled');
}

interface NavigatorLike {
  serviceWorker?: {
    register(url: string, options?: { scope?: string }): Promise<ServiceWorkerRegistration>;
  };
}

/** True when this environment can host a worker at all (SSR and older browsers can't). */
export function isServiceWorkerSupported(nav: NavigatorLike | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  throw new Error('Not implemented: isServiceWorkerSupported');
}

/**
 * Registers the worker, returning the registration or `null` when it was
 * skipped (unsupported environment or flag off). Registration failures are
 * swallowed deliberately: the app is fully functional without a worker, so a
 * failed registration must never break boot.
 */
export async function registerServiceWorker(
  nav: NavigatorLike | undefined = typeof navigator === "undefined" ? undefined : navigator,
): Promise<ServiceWorkerRegistration | null> {
  throw new Error('Not implemented: registerServiceWorker');
}
