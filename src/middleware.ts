import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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

const connectSrcOrigins = Array.from(
  new Set(
    [
      "'self'",
      toOrigin(process.env.NEXT_PUBLIC_API_URL),
      "https://friendbot.stellar.org",
      toOrigin(HORIZON_URL.PUBLIC),
      toOrigin(HORIZON_URL.TESTNET),
      toOrigin(SOROBAN_RPC_URL.PUBLIC),
      toOrigin(SOROBAN_RPC_URL.TESTNET),
      toOrigin(process.env.NEXT_PUBLIC_TRANSACTION_STATUS_URL),
      "https://soroban-testnet.stellar.org",
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

const isDev = process.env.NODE_ENV !== "production";

const cspHeader = [
  "default-src 'self'",
  // `next dev` compiles with eval; without 'unsafe-eval' the enforcing policy
  // breaks local development (#879). Production never gets it.
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`,
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
