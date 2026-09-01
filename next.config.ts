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
 */

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/**
 * Initial JS budget for the client entrypoint, in bytes.
 *
 * 1100 KB is a **ratchet, not a target**: it is set just above what the largest
 * route (`/profile`, ~1000 KB) actually ships today, so the build fails when a
 * change makes things worse. The number this config previously carried was
 * 100 KB, which no route has met for a long time — with enforcement wired up
 * again, that value would fail every CI build regardless of the change under
 * test, which is why it is not restored as-is.
 *
 * Lower it as routes get smaller; the biggest single win available is the
 * ~700 KB `@stellar/stellar-sdk` pulled into every wallet-aware route.
 */
const initialJsBudgetBytes =
  Number(process.env.NEXT_PUBLIC_INITIAL_JS_BUDGET_KB ?? "1100") * 1024;

// In CI, flip webpack performance hints from "warning" to "error" so that
// bundle-size budget violations fail the build instead of scrolling past.
const enforceBudget = process.env.ENFORCE_BUDGET === "true";

const isDev = process.env.NODE_ENV === "development";

// Report-Only for the initial rollout (#239); flip to "Content-Security-Policy"
// once real traffic is confirmed not to trigger violations.
const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";

// NOTE on 'unsafe-inline' in script-src / style-src: this weakens XSS protection
// and is a deliberate tradeoff. The App Router injects inline bootstrap scripts
// for hydration and Tailwind 4 injects inline styles; removing 'unsafe-inline'
// would need a nonce-based CSP with per-request nonce generation and forced
// dynamic rendering on every page — tracked as a follow-up.
//
// `img-src ... data:` is what lets locally stored avatars render; see
// `src/lib/avatar.ts` for why they are data URLs.
//
// IMPORTANT: if NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC points at a custom mainnet
// Soroban RPC endpoint, that exact origin must be added to connect-src or its
// calls will be blocked once this header is enforcing.
const cspHeader = `
  default-src 'self';
  script-src 'self'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self'
    https://horizon.stellar.org
    https://horizon-testnet.stellar.org
    https://soroban-testnet.stellar.org;
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  object-src 'none';
  upgrade-insecure-requests;
`;

const securityHeaders = [
  {
    key: CSP_HEADER_NAME,
    value: cspHeader.replace(/\s{2,}/g, " ").trim(),
  },
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
 * third-party host pages, so it can't ship the blanket `frame-ancestors
 * 'none'` / `X-Frame-Options: DENY` above — that would break every embed.
 * There's no "any origin may frame me" value for X-Frame-Options (ALLOW-FROM
 * is deprecated and ignored by current browsers), so it's omitted here
 * rather than set to something misleading; `frame-ancestors *` is the actual,
 * modern equivalent. The real security boundary for the widget isn't "who
 * can put us in an iframe" — it's the postMessage origin check in
 * src/lib/widget.ts, since the widget never trusts a message (or reveals a
 * result) without validating the declared parent origin.
 */
const widgetSecurityHeaders = [
  {
    key: CSP_HEADER_NAME,
    value: cspHeader
      .replace(/frame-ancestors 'none';/, "frame-ancestors *;")
      .replace(/\s{2,}/g, " ")
      .trim(),
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
      // Excludes /widget so its relaxed frame-ancestors below is the only
      // one ever applied there — no two entries ever match the same path.
      {
        source: "/((?!widget).*)",
        headers: securityHeaders,
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
        maxAssetSize: Math.max(initialJsBudgetBytes, 200 * 1024),
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
