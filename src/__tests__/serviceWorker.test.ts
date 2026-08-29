import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CACHEABLE_EXTENSIONS,
  NEVER_CACHE_ORIGINS,
  SW_CACHE_NAME,
  SW_CACHE_PREFIX,
  SW_CACHE_VERSION,
  SW_SCOPE,
  SW_SCRIPT_URL,
  cacheStrategyFor,
  isCacheableAsset,
  isCacheableResponse,
  isServiceWorkerEnabled,
  isServiceWorkerSupported,
  isStaleCache,
  registerServiceWorker,
  shouldBypassCache,
} from "@/lib/serviceWorker";

/**
 * Unit tests for the service worker. (#345)
 *
 * Two halves:
 *  1. the pure routing/lifecycle logic in src/lib/serviceWorker.ts, and
 *  2. a drift guard asserting public/sw.js — which cannot import from src/ —
 *     still carries the same constants and rules.
 */

const ORIGIN = "https://bridge.example";

describe("shouldBypassCache", () => {
  it("bypasses every non-GET method", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
      expect(shouldBypassCache({ url: `${ORIGIN}/`, method })).toBe(true);
    }
  });

  it("treats a missing method as GET", () => {
    expect(shouldBypassCache({ url: `${ORIGIN}/` })).toBe(false);
  });

  it("is case-insensitive about the method", () => {
    expect(shouldBypassCache({ url: `${ORIGIN}/`, method: "get" })).toBe(false);
    expect(shouldBypassCache({ url: `${ORIGIN}/`, method: "post" })).toBe(true);
  });

  it.each(NEVER_CACHE_ORIGINS)("never caches Stellar network origin %s", (origin) => {
    // Stale consensus state (balances, sequence numbers) would make the app
    // build invalid transactions, so these must always hit the network.
    expect(shouldBypassCache({ url: `${origin}/accounts/GABC`, method: "GET" })).toBe(true);
  });

  it("bypasses /api routes", () => {
    expect(shouldBypassCache({ url: `${ORIGIN}/api`, method: "GET" })).toBe(true);
    expect(shouldBypassCache({ url: `${ORIGIN}/api/quote`, method: "GET" })).toBe(true);
  });

  it("does not bypass paths that merely start with the letters 'api'", () => {
    expect(shouldBypassCache({ url: `${ORIGIN}/apidocs`, method: "GET" })).toBe(false);
  });

  it("bypasses non-http(s) schemes the Cache API rejects", () => {
    expect(shouldBypassCache({ url: "chrome-extension://abc/inject.js" })).toBe(true);
    expect(shouldBypassCache({ url: "data:text/plain,hi" })).toBe(true);
  });

  it("bypasses unparseable URLs rather than throwing", () => {
    expect(shouldBypassCache({ url: "not a url" })).toBe(true);
  });
});

describe("isCacheableAsset", () => {
  it.each(CACHEABLE_EXTENSIONS)("accepts %s assets", (ext) => {
    expect(isCacheableAsset(`/static/chunk${ext}`)).toBe(true);
  });

  it("is case-insensitive about the extension", () => {
    expect(isCacheableAsset("/cex/BINANCE.SVG")).toBe(true);
  });

  it("rejects documents and extensionless routes", () => {
    expect(isCacheableAsset("/")).toBe(false);
    expect(isCacheableAsset("/bridge")).toBe(false);
    expect(isCacheableAsset("/index.html")).toBe(false);
  });
});

describe("cacheStrategyFor", () => {
  it("serves same-origin static assets cache-first", () => {
    expect(cacheStrategyFor({ url: `${ORIGIN}/cex/binance.svg` }, ORIGIN)).toBe("cache-first");
  });

  it("serves same-origin documents network-first so deploys always win", () => {
    expect(cacheStrategyFor({ url: `${ORIGIN}/bridge` }, ORIGIN)).toBe("network-first");
    expect(cacheStrategyFor({ url: `${ORIGIN}/` }, ORIGIN)).toBe("network-first");
  });

  it("sends cross-origin requests straight to the network", () => {
    expect(cacheStrategyFor({ url: "https://cdn.example/logo.svg" }, ORIGIN)).toBe("network-only");
  });

  it("sends bypassed requests straight to the network", () => {
    expect(cacheStrategyFor({ url: `${ORIGIN}/bridge`, method: "POST" }, ORIGIN)).toBe("network-only");
    expect(cacheStrategyFor({ url: `${ORIGIN}/api/quote` }, ORIGIN)).toBe("network-only");
    expect(
      cacheStrategyFor({ url: "https://horizon.stellar.org/accounts/GABC" }, ORIGIN),
    ).toBe("network-only");
  });
});

describe("isStaleCache", () => {
  it("flags older versions of this app's caches", () => {
    expect(isStaleCache(`${SW_CACHE_PREFIX}v0`)).toBe(true);
  });

  it("keeps the current cache", () => {
    expect(isStaleCache(SW_CACHE_NAME)).toBe(false);
  });

  it("never touches caches owned by other code", () => {
    expect(isStaleCache("workbox-precache-v2")).toBe(false);
    expect(isStaleCache("")).toBe(false);
  });
});

describe("isCacheableResponse", () => {
  it("stores OK same-origin responses", () => {
    expect(isCacheableResponse({ ok: true, status: 200, type: "basic" })).toBe(true);
  });

  it("rejects errors, opaque responses and partial content", () => {
    expect(isCacheableResponse({ ok: false, status: 500, type: "basic" })).toBe(false);
    expect(isCacheableResponse({ ok: true, status: 200, type: "opaque" })).toBe(false);
    expect(isCacheableResponse({ ok: true, status: 206, type: "basic" })).toBe(false);
    expect(isCacheableResponse(null)).toBe(false);
    expect(isCacheableResponse(undefined)).toBe(false);
  });
});

describe("isServiceWorkerSupported", () => {
  it("is false without a navigator (SSR)", () => {
    expect(isServiceWorkerSupported(undefined)).toBe(false);
  });

  it("is false when the browser has no serviceWorker API", () => {
    expect(isServiceWorkerSupported({})).toBe(false);
  });

  it("is true when register() is available", () => {
    expect(isServiceWorkerSupported({ serviceWorker: { register: async () => ({}) as ServiceWorkerRegistration } })).toBe(true);
  });
});

describe("registerServiceWorker", () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_SW;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_ENABLE_SW;
    else process.env.NEXT_PUBLIC_ENABLE_SW = originalFlag;
  });

  function navigatorWith(register: (url: string, options?: { scope?: string }) => Promise<ServiceWorkerRegistration>) {
    return { serviceWorker: { register } };
  }

  it("does nothing while the opt-in flag is off", async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_SW;
    let called = false;
    const result = await registerServiceWorker(
      navigatorWith(async () => {
        called = true;
        return {} as ServiceWorkerRegistration;
      }),
    );
    expect(called).toBe(false);
    expect(result).toBeNull();
  });

  it("registers /sw.js at the root scope when enabled", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SW = "true";
    const calls: Array<[string, { scope?: string } | undefined]> = [];
    const registration = { scope: SW_SCOPE } as ServiceWorkerRegistration;

    const result = await registerServiceWorker(
      navigatorWith(async (url, options) => {
        calls.push([url, options]);
        return registration;
      }),
    );

    expect(calls).toEqual([[SW_SCRIPT_URL, { scope: SW_SCOPE }]]);
    expect(result).toBe(registration);
    expect(isServiceWorkerEnabled()).toBe(true);
  });

  it("returns null instead of throwing when registration fails", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SW = "true";
    await expect(
      registerServiceWorker(
        navigatorWith(async () => {
          throw new Error("SecurityError: insecure origin");
        }),
      ),
    ).resolves.toBeNull();
  });

  it("returns null in an unsupported environment", async () => {
    process.env.NEXT_PUBLIC_ENABLE_SW = "true";
    await expect(registerServiceWorker(undefined)).resolves.toBeNull();
    await expect(registerServiceWorker({})).resolves.toBeNull();
  });
});

describe("public/sw.js stays in sync with the shared constants", () => {
  const swSource = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

  it("uses the same cache version and prefix", () => {
    expect(swSource).toContain(`const CACHE_VERSION = "${SW_CACHE_VERSION}";`);
    expect(swSource).toContain(`const CACHE_PREFIX = "${SW_CACHE_PREFIX}";`);
  });

  it("lists every never-cache origin", () => {
    for (const origin of NEVER_CACHE_ORIGINS) {
      expect(swSource).toContain(origin);
    }
  });

  it("lists every cacheable extension", () => {
    for (const ext of CACHEABLE_EXTENSIONS) {
      expect(swSource).toContain(`"${ext}"`);
    }
  });

  it("cleans up stale caches on activate and claims clients", () => {
    expect(swSource).toContain('addEventListener("activate"');
    expect(swSource).toContain("caches.delete");
    expect(swSource).toContain("clients.claim()");
  });

  it("takes over immediately on install", () => {
    expect(swSource).toContain('addEventListener("install"');
    expect(swSource).toContain("skipWaiting()");
  });

  it("handles fetch and bypasses non-cacheable requests", () => {
    expect(swSource).toContain('addEventListener("fetch"');
    expect(swSource).toContain("shouldBypassCache(request)");
  });
});
