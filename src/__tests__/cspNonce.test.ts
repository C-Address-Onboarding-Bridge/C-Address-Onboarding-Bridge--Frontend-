import { describe, it, expect } from "vitest";

/**
 * Tests for the CSP nonce middleware behaviour (issue #457).
 *
 * We test the CSP string-building logic directly without running a full
 * Next.js middleware stack, since that would require a live Edge runtime.
 */

/**
 * Mirror the production connect-src construction from src/middleware.ts
 * (issue #700). The API URL, friendbot and any configured Soroban RPC
 * endpoints must be allowed so health/batch/locks calls, the faucet and
 * mainnet Soroban RPC are not blocked by the enforced policy.
 */
function buildConnectSrc(env: Record<string, string | undefined>): string {
  const sources = [
    "'self'",
    "https://horizon.stellar.org",
    "https://horizon-testnet.stellar.org",
    "https://soroban-testnet.stellar.org",
    "https://friendbot.stellar.org",
  ];

  const apiUrl = env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    try {
      sources.push(new URL(apiUrl).origin);
    } catch {
      // ignore malformed URLs
    }
  }

  const sorobanRpc = env.NEXT_PUBLIC_SOROBAN_RPC_URL;
  if (sorobanRpc) {
    try {
      sources.push(new URL(sorobanRpc).origin);
    } catch {
      // ignore malformed URLs
    }
  }

  return ["connect-src", ...Array.from(new Set(sources))].join(" ");
}

/** Mirror the production CSP construction from src/middleware.ts */
function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    buildConnectSrc({}),
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Mirror the widget CSP construction from src/middleware.ts (issue #699).
 *
 * The embeddable widget must be frameable by third-party origins, so its
 * policy relaxes `frame-ancestors` to `*` while keeping the rest of the
 * hardening directives intact.
 */
function buildWidgetCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    buildConnectSrc({}),
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors *",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Mirror the path check used by src/middleware.ts to select the widget policy. */
function isWidgetPath(pathname: string): boolean {
  return pathname === "/widget" || pathname.startsWith("/widget/");
}

describe("CSP nonce middleware", () => {
  it("production policy does not contain 'unsafe-inline' in script-src", () => {
    const csp = buildCsp("abc123", false /* production */);
    // Extract just the script-src directive to check for unsafe-inline
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("production policy does not contain 'unsafe-eval' in script-src", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("development policy includes 'unsafe-eval' for HMR", () => {
    const csp = buildCsp("abc123", true /* dev */);
    expect(csp).toContain("'unsafe-eval'");
  });

  it("development policy does not contain 'unsafe-inline' in script-src", () => {
    const csp = buildCsp("abc123", true);
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("nonce is present in script-src", () => {
    const nonce = "testNonce1234==";
    const csp = buildCsp(nonce, false);
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it("different calls produce CSP strings referencing their respective nonces", () => {
    const nonce1 = "nonceAAA=";
    const nonce2 = "nonceBBB=";
    const csp1 = buildCsp(nonce1, false);
    const csp2 = buildCsp(nonce2, false);
    expect(csp1).toContain(`'nonce-${nonce1}'`);
    expect(csp2).toContain(`'nonce-${nonce2}'`);
    expect(csp1).not.toContain(nonce2);
    expect(csp2).not.toContain(nonce1);
  });

  it("policy includes required directives", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("https://horizon.stellar.org");
  });
});

describe("CSP connect-src (issue #700)", () => {
  it("allows the configured API origin", () => {
    const connectSrc = buildConnectSrc({
      NEXT_PUBLIC_API_URL: "https://api.example.com/v1",
    });
    expect(connectSrc).toContain("https://api.example.com");
  });

  it("allows friendbot for the faucet", () => {
    const connectSrc = buildConnectSrc({});
    expect(connectSrc).toContain("https://friendbot.stellar.org");
  });

  it("allows a configured mainnet Soroban RPC origin", () => {
    const connectSrc = buildConnectSrc({
      NEXT_PUBLIC_SOROBAN_RPC_URL: "https://soroban-mainnet.stellar.org",
    });
    expect(connectSrc).toContain("https://soroban-mainnet.stellar.org");
  });

  it("keeps the default Horizon and testnet Soroban hosts", () => {
    const connectSrc = buildConnectSrc({});
    expect(connectSrc).toContain("https://horizon.stellar.org");
    expect(connectSrc).toContain("https://horizon-testnet.stellar.org");
    expect(connectSrc).toContain("https://soroban-testnet.stellar.org");
  });

  it("does not duplicate origins when the API matches a default host", () => {
    const connectSrc = buildConnectSrc({
      NEXT_PUBLIC_API_URL: "https://horizon.stellar.org",
    });
    const occurrences = connectSrc.split("https://horizon.stellar.org").length - 1;
    expect(occurrences).toBe(1);
  });

  it("ignores malformed configured URLs", () => {
    const connectSrc = buildConnectSrc({
      NEXT_PUBLIC_API_URL: "not a url",
      NEXT_PUBLIC_SOROBAN_RPC_URL: "also bad",
    });
    expect(connectSrc).toContain("connect-src 'self'");
    expect(connectSrc).not.toContain("not a url");
    expect(connectSrc).not.toContain("also bad");
  });
});

describe("CSP framing for /widget (issue #699)", () => {
  it("widget policy allows framing via frame-ancestors *", () => {
    const csp = buildWidgetCsp("abc123", false);
    expect(csp).toContain("frame-ancestors *");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it("non-widget routes keep the enforcing frame-ancestors 'none'", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("frame-ancestors *");
  });

  it("selects the widget policy only for /widget paths", () => {
    expect(isWidgetPath("/widget")).toBe(true);
    expect(isWidgetPath("/widget/embed")).toBe(true);
    expect(isWidgetPath("/")).toBe(false);
    expect(isWidgetPath("/dashboard")).toBe(false);
    expect(isWidgetPath("/widgets")).toBe(false);
  });

  it("widget policy keeps the remaining hardening directives", () => {
    const csp = buildWidgetCsp("abc123", false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
});
