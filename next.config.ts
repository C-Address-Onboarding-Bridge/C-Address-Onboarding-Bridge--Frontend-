import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

/**
 * Build configuration (#332).
 *
 * Three things that the build is expected to provide had been dropped from this
 * file and are restored here, because the rest of the repo still assumes them:
 *
 *   1. **Bundle analysis** — `npm run analyze` sets `ANALYZE=true` and the
 *      `@next/bundle-analyzer` devDependency is installed, but nothing consumed
 *      either, so the script was a no-op.
 *   2. **Initial-JS budget** — CI runs the production build with
 *      `ENFORCE_BUDGET=true` expecting a budget violation to fail the build.
 *      Without the webpack `performance` block that env var did nothing.
 *   3. **Security headers** — `src/lib/avatar.ts` documents that "the app's CSP
 *      allows img-src 'self' data:", and `src/__tests__/security-audit.ts`
 *      asserts the whole header set. Both were describing headers this config
 *      no longer sent.
 *
 * NOTE (#879): the Content-Security-Policy itself is emitted by
 * `src/middleware.ts`, which needs a per-request nonce and env-driven
 * connect-src. This file only carries the static headers, so there is exactly
 * one CSP on every response.
 */

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/**
 * Initial JS budget for the client entrypoint, in bytes.
 *
 * 700 KB is a **ratchet, not a target**: the largest route currently loads
 * 675 KB of JavaScript on first render. The Stellar SDK remains available in a
 * deferred chunk and is fetched only when a Stellar network/transaction
 * operation needs it.
 */
const initialJsBudgetBytes =
  Number(process.env.NEXT_PUBLIC_INITIAL_JS_BUDGET_KB ?? "700") * 1024;

// The transaction-only SDK chunk exceeds the initial route budget. Keep a
// separate 1 MB per-asset ceiling so lazy transaction code doesn't trip it.
const maxJsAssetBytes = 1024 * 1024;

// In CI, flip webpack performance hints from "warning" to "error" so that
// bundle-size budget violations fail the build instead of scrolling past.
const enforceBudget = process.env.ENFORCE_BUDGET === "true";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

/**
 * The embeddable widget (#558) exists specifically to be framed by
 * third-party host pages, so it can't ship the blanket `X-Frame-Options: DENY`
 * above — that would break every embed. There's no "any origin may frame me"
 * value for X-Frame-Options (ALLOW-FROM is deprecated and ignored by current
 * browsers), so it's omitted here rather than set to something misleading; the
 * middleware's `frame-ancestors *` is the actual, modern equivalent. The real
 * security boundary for the widget isn't "who can put us in an iframe" — it's
 * the postMessage origin check in src/lib/widget.ts, since the widget never
 * trusts a message (or reveals a result) without validating the declared
 * parent origin.
 */
const widgetSecurityHeaders = [
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `x-powered-by` names the framework and version to anyone scanning; it buys
  // nothing at runtime.
  poweredByHeader: false,

  // Performance: bundle analysis and optimization. lucide-react re-exports
  // every icon from one barrel file, so without this a single icon import can
  // pull the whole set into the client bundle.
  experimental: {
    optimizePackageImports: [
      "@stellar/stellar-sdk",
      "@stellar/freighter-api",
      "lucide-react",
    ],
  },

  // Suppress hydration warnings in development
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },

  async headers() {
    return [
      // Excludes /widget and /widget/* so its relaxed headers below are the
      // only ones ever applied there — no two entries ever match the same
      // path. Scoped exactly (not a "starts with widget" prefix) so routes
      // like /widgets or /widget-preview keep X-Frame-Options: DENY.
      {
        source: "/((?!widget(?:/|$)).*)",
        headers: securityHeaders,
      },
      {
        source: "/widget",
        headers: widgetSecurityHeaders,
      },
      {
        source: "/widget/:path*",
        headers: widgetSecurityHeaders,
      },
    ];
  },

  // Webpack optimizations
  webpack: (config, { isServer }) => {
    // Reduce bundle size by excluding server-only packages from client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };

      config.performance = {
        ...config.performance,
        maxEntrypointSize: initialJsBudgetBytes,
        maxAssetSize: Math.max(maxJsAssetBytes, initialJsBudgetBytes),
        hints:
          process.env.NODE_ENV === "production"
            ? enforceBudget
              ? "error"
              : "warning"
            : false,
      };
    }
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
