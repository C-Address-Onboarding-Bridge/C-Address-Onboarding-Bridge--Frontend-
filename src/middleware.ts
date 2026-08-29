import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV === "development";

/**
 * Per-request Content-Security-Policy middleware.
 *
 * Generates a cryptographically random nonce on every request and injects it
 * into the script-src directive so Next.js inline hydration scripts are
 * allowed without needing 'unsafe-inline'. The nonce is also forwarded to the
 * App Router via the `x-nonce` request header so layout.tsx can pass it to
 * <Script nonce={…}> and server-rendered inline scripts.
 *
 * Supersedes the static CSP added by next.config.ts headers() for all
 * HTML responses. Static assets (/_next/static, /favicon.ico, etc.) are
 * served without a nonce because they don't execute inline scripts.
 *
 * See: https://nextjs.org/docs/app/guides/content-security-policy
 */
export function middleware(request: NextRequest): NextResponse {
  // Generate a URL-safe base64 nonce (128 bits of entropy).
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Buffer.from(nonceBytes).toString("base64");

  const csp = [
    "default-src 'self'",
    // Allow our own scripts + nonce-guarded inline scripts (Next.js hydration).
    // 'unsafe-eval' is limited to development only (needed by HMR / Fast Refresh).
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    // style-src keeps 'unsafe-inline' because Tailwind 4 injects inline styles
    // at runtime and does not yet support nonce-based injection.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    [
      "connect-src 'self'",
      "https://horizon.stellar.org",
      "https://horizon-testnet.stellar.org",
      "https://soroban-testnet.stellar.org",
    ].join(" "),
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Forward the nonce to the App Router so server components can read it via
  // the `headers()` API and pass it to inline scripts / <Script nonce={…}>.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set the enforcing CSP header on every response.
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

/**
 * Run middleware on all routes except Next.js internals and static files.
 * API routes are included so XHR/fetch responses also carry the CSP.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image  (image optimisation files)
     * - favicon.ico, sitemap.xml, robots.txt (static metadata)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)",
  ],
};
