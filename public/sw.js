/* eslint-disable no-undef */
/**
 * C-Address Bridge service worker. (#345)
 *
 * Registered only when NEXT_PUBLIC_ENABLE_SW=true — see src/lib/serviceWorker.ts,
 * which holds the same constants and routing rules as pure, unit-tested
 * functions. src/__tests__/serviceWorker.test.ts asserts this file still agrees
 * with that module, so the two cannot drift apart.
 *
 * Strategy summary:
 *   network-only  — non-GET, /api/*, cross-origin, and every Stellar RPC/Horizon
 *                   origin (stale consensus state would produce invalid transactions)
 *   cache-first   — same-origin static assets
 *   network-first — same-origin documents, cache used only as an offline fallback
 */

// Version from build time: format is CACHE_PREFIX + timestamp (milliseconds since epoch).
// Replace __CACHE_VERSION__ at build time via next.config.ts or during deploy.
// Falls back to timestamp if not replaced, ensuring stale caches are cleaned up.
const CACHE_VERSION = typeof __CACHE_VERSION__ !== 'undefined' ? __CACHE_VERSION__ : 'v-' + Date.now();
const CACHE_PREFIX = "c-address-bridge-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const NEVER_CACHE_ORIGINS = [
  "https://horizon.stellar.org",
  "https://horizon-testnet.stellar.org",
  "https://soroban-testnet.stellar.org",
];

const CACHEABLE_EXTENSIONS = [
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

function shouldBypassCache(request) {
  if (request.method !== "GET") return true;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (NEVER_CACHE_ORIGINS.includes(url.origin)) return true;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return true;

  return false;
}

function isCacheableAsset(pathname) {
  const lower = pathname.toLowerCase();

  // Exclude unversioned public files that should always be fresh.
  // These live in public/ (e.g., /theme-init.js, /aframp-widget.js, /cex/*.svg)
  // and don't have content hashes in their names, so cache-first would serve stale
  // versions after deploys. Only /_next/static/* has hashed filenames and is safe
  // to cache-first. (#887)
  if (pathname.startsWith("/theme-init") ||
      pathname.startsWith("/aframp-widget") ||
      pathname.startsWith("/cex/")) {
    return false;
  }

  return CACHEABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isStaleCache(cacheName) {
  return cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME;
}

function isCacheableResponse(response) {
  if (!response || response.ok !== true || response.status === 206) return false;
  return response.type === "basic" || response.type === "default";
}

self.addEventListener("install", () => {
  // Nothing is pre-cached: the app shell is content-hashed by Next and a
  // hand-maintained precache list goes stale on every deploy.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter(isStaleCache).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

async function evictOldCacheEntries() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();

  // Evict entries that are clearly temporary (query strings, RSC payloads).
  // These include funding links (?target=, ?amount=), bridge forms (?to=, ?amount=),
  // and Next.js RSC responses (?_rsc=). (#890)
  const toDelete = keys.filter(req => {
    const url = new URL(req.url);
    // Delete URLs with query parameters (funding links, forms, RSC payloads)
    if (url.search) return true;
    return false;
  });

  await Promise.all(toDelete.map(req => cache.delete(req)));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    // Clean up old entries periodically
    await evictOldCacheEntries();
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (shouldBypassCache(request)) return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (isCacheableAsset(new URL(request.url).pathname)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
