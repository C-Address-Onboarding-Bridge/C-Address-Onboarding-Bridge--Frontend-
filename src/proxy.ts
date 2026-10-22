import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAllowedEmbedderOrigins, buildFrameAncestorsCsp } from "@/lib/widget";
import { SOROBAN_RPC_URL, HORIZON_URL } from "./lib/types";

/**
 * Enforcing CSP applied to every route except the embeddable widget.
 *
 * This middleware is the single source of truth for the CSP (#879). The
 * previous Report-Only copy in next.config.ts has been removed so pages no
 * longer receive two conflicting policies.
 *
 * `frame-ancestors 'none'` is the important part here: it stops any page from
 * framing the app. The widget (#558) is the one deliberate exception — it
 * exists to be embedded by third-party hosts — so it gets its own policy below
 * instead of inheriting this one.
 */
const CSP_HEADER_NAME = "Content-Security-Policy";

/**
 * Request header used to hand the per-request nonce to the app (root layout).
 * The layout reads it via `headers()` and stamps it on inline scripts so the
 * App Router's streamed RSC bootstrap scripts are allowed by the CSP (#876).
 */
const NONCE_HEADER_NAME = "x-nonce";

/**
 * Origins the app is allowed to talk to. Built from the configured URLs so the
 * policy can't drift from what the app actually calls (#700, #882): the API
 * (health/batch/locks), friendbot (faucet), the Horizon hosts and the
 * configured Soroban RPC endpoints (testnet and mainnet).
 *
 * The Soroban RPC and Horizon origins come from the same constants the app
 * uses to build its clients (src/lib/types.ts), so a custom mainnet RPC or
 * Horizon host is never blocked by the enforcing CSP.
 */
function toOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildConnectSrcOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return Array.from(
  new Set(
    [
      "'self'",
      toOrigin(env.NEXT_PUBLIC_API_URL),
      "https://friendbot.stellar.org",
      toOrigin(HORIZON_URL.PUBLIC),
      toOrigin(HORIZON_URL.TESTNET),
      toOrigin(SOROBAN_RPC_URL.PUBLIC),
      toOrigin(SOROBAN_RPC_URL.TESTNET),
      toOrigin(env.NEXT_PUBLIC_TRANSACTION_STATUS_URL),
      "https://horizon.stellar.org",
      "https://horizon-testnet.stellar.org",
      toOrigin(env.NEXT_PUBLIC_SOROBAN_RPC_URL),
      toOrigin(env.NEXT_PUBLIC_SOROBAN_RPC_TESTNET_URL),
      toOrigin(env.NEXT_PUBLIC_SOROBAN_RPC_MAINNET_URL),
      "https://soroban-testnet.stellar.org",
    ].filter((origin): origin is string => Boolean(origin)),
  ),
  );
}

export function buildCsp(
  env: Record<string, string | undefined> = process.env,
  nonce?: string,
): string {
  const connectSrcOrigins = buildConnectSrcOrigins(env);
  // With a nonce, `'strict-dynamic'` lets the nonce-trusted bootstrap scripts
  // load the rest of the bundle (#876). Without one the policy is `'self'` only.
  // `next dev` compiles with eval; without 'unsafe-eval' the enforcing policy
  // breaks local development (#879). Production never gets it.
  const evalSrc = env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalSrc}`
    : `script-src 'self'${evalSrc}`;
  return [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src ${connectSrcOrigins.join(" ")}`,
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");
}

export function buildWidgetCsp(
  env: Record<string, string | undefined> = process.env,
  nonce?: string,
): string {
  // frame-ancestors comes from the registered embedder allowlist
  // (NEXT_PUBLIC_WIDGET_ALLOWED_ORIGINS); with nothing registered it stays
  // 'none' so unregistered origins can't frame the widget.
  const frameAncestors = buildFrameAncestorsCsp(
    getAllowedEmbedderOrigins(env.NEXT_PUBLIC_WIDGET_ALLOWED_ORIGINS),
  );
  return buildCsp(env, nonce).replace("frame-ancestors 'none'", frameAncestors);
}

/**
 * The widget is meant to be framed by arbitrary host pages, so it can't ship
 * `frame-ancestors 'none'`. This mirrors the relaxed policy in next.config.ts
 * (which omits X-Frame-Options for /widget for the same reason). The real
 * security boundary for the widget is the postMessage origin check in
 * src/lib/widget.ts, not who is allowed to frame it.
 */
export function isWidgetPath(pathname: string): boolean {
  return pathname === "/widget" || pathname.startsWith("/widget/");
}

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function proxy(request: NextRequest) {
  const nonce = generateNonce();

  // Forward the nonce to the app via a request header so the root layout can
  // read it with `headers()` and stamp it on inline scripts (#876).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER_NAME, nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set(
    CSP_HEADER_NAME,
    isWidgetPath(request.nextUrl.pathname)
      ? buildWidgetCsp(process.env, nonce)
      : buildCsp(process.env, nonce),
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
