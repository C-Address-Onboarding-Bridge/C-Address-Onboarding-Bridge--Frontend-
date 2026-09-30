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

const cspHeader = [
  "default-src 'self'",
  "script-src 'self'",
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

/**
 * The widget is meant to be framed by arbitrary host pages, so it can't ship
 * `frame-ancestors 'none'`. This mirrors the relaxed policy in next.config.ts
 * (which omits X-Frame-Options for /widget for the same reason). The real
 * security boundary for the widget is the postMessage origin check in
 * src/lib/widget.ts, not who is allowed to frame it.
 */
const widgetCspHeader = cspHeader.replace(
  "frame-ancestors 'none'",
  "frame-ancestors *",
);

function isWidgetPath(pathname: string): boolean {
  return pathname === "/widget" || pathname.startsWith("/widget/");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set(
    CSP_HEADER_NAME,
    isWidgetPath(request.nextUrl.pathname) ? widgetCspHeader : cspHeader,
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
