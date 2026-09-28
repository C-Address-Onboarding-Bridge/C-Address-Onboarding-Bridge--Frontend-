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

const cspHeader = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://horizon.stellar.org https://horizon-testnet.stellar.org https://soroban-testnet.stellar.org",
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
