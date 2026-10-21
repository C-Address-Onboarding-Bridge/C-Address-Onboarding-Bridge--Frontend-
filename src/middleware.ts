import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAllowedEmbedderOrigins, buildFrameAncestorsCsp } from "@/lib/widget";

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
 * The widget CSP is built from the registered embedder allowlist
 * (NEXT_PUBLIC_WIDGET_ALLOWED_ORIGINS env var). When nothing is registered,
 * frame-ancestors is set to 'none' to prevent framing by unregistered origins.
 * This is computed per-request so changes to the allowlist take effect
 * without redeployment.
 */
function getWidgetCspHeader(): string {
  const allowedOrigins = getAllowedEmbedderOrigins();
  const frameAncestors = buildFrameAncestorsCsp(allowedOrigins);
  return cspHeader.replace("frame-ancestors 'none'", frameAncestors);
}

function isWidgetPath(pathname: string): boolean {
  return pathname === "/widget" || pathname.startsWith("/widget/");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set(
    CSP_HEADER_NAME,
    isWidgetPath(request.nextUrl.pathname) ? getWidgetCspHeader() : cspHeader,
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
