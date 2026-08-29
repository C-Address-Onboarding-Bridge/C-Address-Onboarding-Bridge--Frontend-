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

const CACHE_VERSION = "v1";
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

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
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
