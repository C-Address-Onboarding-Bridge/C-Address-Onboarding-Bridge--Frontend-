import type { NextConfig } from "next";
import path from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const initialJsBudgetBytes = Number(process.env.NEXT_PUBLIC_INITIAL_JS_BUDGET_KB ?? "100") * 1024;

// In CI, flip webpack performance hints from "warning" to "error"
// so that bundle-size budget violations fail the build.
const enforceBudget = process.env.ENFORCE_BUDGET === "true";

// Enforcing CSP header (switched from Report-Only after validating no
// legitimate traffic triggered violations — see issues #239, #456).
const CSP_HEADER_NAME = "Content-Security-Policy";

// NOTE: The primary CSP is generated per-request in src/middleware.ts, which
// injects a random nonce into script-src so Next.js inline hydration scripts
// are permitted without 'unsafe-inline'. The static header below is a
// conservative fallback for any response that bypasses middleware (e.g. direct
// static-file serving in certain deployment configs). It intentionally omits
// 'unsafe-inline' from script-src; style-src retains it because Tailwind 4
// injects inline styles at runtime and does not yet support nonce injection.
const isDev = process.env.NODE_ENV === "development";
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

// IMPORTANT: if you set NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC to a custom mainnet
// Soroban RPC endpoint (e.g. your own hosted RPC, a commercial provider), you
// MUST also add that exact origin to the connect-src directive above, or RPC
// calls to it will be blocked by the CSP when flipping to enforcing mode.

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

const nextConfig: NextConfig = {
  turbopack: {},
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  webpack(config, { isServer }) {
    if (!isServer) {
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

    config.resolve.alias = {
      ...config.resolve.alias,
      "@/lib/stellar": path.join(__dirname, "src/lib/stellar"),
    };
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);