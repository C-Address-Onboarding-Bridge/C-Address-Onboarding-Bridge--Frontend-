import { describe, it, expect } from "vitest";

/**
 * Tests for the CSP nonce middleware behaviour (issue #457).
 *
 * We test the CSP string-building logic directly without running a full
 * Next.js middleware stack, since that would require a live Edge runtime.
 */

/** Mirror the production CSP construction from src/middleware.ts */
function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
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
