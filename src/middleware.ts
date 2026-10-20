import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Enforcing CSP applied to every route except the embeddable widget.
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
 * policy can't drift from what the app actually calls (#700): the API
 * (health/batch/locks), friendbot (faucet), the Horizon hosts and the
 * configured Soroban RPC endpoints (testnet and mainnet).
 */
function toOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const connectSrcOrigins = Array.from(
  new Set(
    [
      "'self'",
      toOrigin(process.env.NEXT_PUBLIC_API_URL),
      "https://friendbot.stellar.org",
      "https://horizon.stellar.org",
      "https://horizon-testnet.stellar.org",
      toOrigin(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL),
      toOrigin(process.env.NEXT_PUBLIC_SOROBAN_RPC_TESTNET_URL),
      toOrigin(process.env.NEXT_PUBLIC_SOROBAN_RPC_MAINNET_URL),
      "https://soroban-testnet.stellar.org",
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

/**
 * Build the enforcing CSP for a given per-request nonce. `'strict-dynamic'`
 * lets the nonce-trusted bootstrap scripts load the rest of the bundle, which
 * is what the App Router relies on for its inline `self.__next_f.push(...)`
 * payloads (#876).
 */
function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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

/**
 * The widget is meant to be framed by arbitrary host pages, so it can't ship
 * `frame-ancestors 'none'`. This mirrors the relaxed policy in next.config.ts
 * (which omits X-Frame-Options for /widget for the same reason). The real
 * security boundary for the widget is the postMessage origin check in
 * src/lib/widget.ts, not who is allowed to frame it.
 */
function toWidgetCspHeader(cspHeader: string): string {
  return cspHeader.replace("frame-ancestors 'none'", "frame-ancestors *");
}

function isWidgetPath(pathname: string): boolean {
  return pathname === "/widget" || pathname.startsWith("/widget/");
}

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const cspHeader = buildCspHeader(nonce);

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
      ? toWidgetCspHeader(cspHeader)
      : cspHeader,
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
