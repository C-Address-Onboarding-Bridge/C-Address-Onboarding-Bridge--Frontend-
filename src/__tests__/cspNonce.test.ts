import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { buildCsp, buildWidgetCsp, isWidgetPath, proxy } from "@/proxy";

/**
 * Tests the real CSP builders and proxy (formerly middleware) exported from
 * src/proxy.ts (#866). The policy currently uses `script-src 'self'` with no
 * nonce, so these assertions describe what is actually shipped.
 */

function scriptSrc(csp: string): string | undefined {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
}

describe("CSP policy", () => {
  it("script-src is 'self' only, without unsafe-inline or unsafe-eval", () => {
    const csp = buildCsp({});
    expect(scriptSrc(csp)).toBe("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("includes required directives", () => {
    const csp = buildCsp({});
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("https://horizon.stellar.org");
  });
});

describe("CSP connect-src (issue #700)", () => {
  it("allows the configured API origin", () => {
    expect(buildCsp({ NEXT_PUBLIC_API_URL: "https://api.example.com/v1" })).toContain(
      "https://api.example.com",
    );
  });

  it("allows friendbot and the default Horizon/Soroban hosts", () => {
    const csp = buildCsp({});
    expect(csp).toContain("https://friendbot.stellar.org");
    expect(csp).toContain("https://horizon.stellar.org");
    expect(csp).toContain("https://horizon-testnet.stellar.org");
    expect(csp).toContain("https://soroban-testnet.stellar.org");
  });

  it("allows configured Soroban RPC origins", () => {
    const csp = buildCsp({
      NEXT_PUBLIC_SOROBAN_RPC_URL: "https://rpc.example.com",
      NEXT_PUBLIC_SOROBAN_RPC_TESTNET_URL: "https://rpc-testnet.example.com",
      NEXT_PUBLIC_SOROBAN_RPC_MAINNET_URL: "https://soroban-mainnet.stellar.org",
    });
    expect(csp).toContain("https://rpc.example.com");
    expect(csp).toContain("https://rpc-testnet.example.com");
    expect(csp).toContain("https://soroban-mainnet.stellar.org");
  });

  it("does not duplicate origins", () => {
    const csp = buildCsp({ NEXT_PUBLIC_API_URL: "https://horizon.stellar.org" });
    expect(csp.split("https://horizon.stellar.org").length - 1).toBe(1);
  });

  it("ignores malformed configured URLs", () => {
    const csp = buildCsp({
      NEXT_PUBLIC_API_URL: "not a url",
      NEXT_PUBLIC_SOROBAN_RPC_URL: "also bad",
    });
    expect(csp).not.toContain("not a url");
    expect(csp).not.toContain("also bad");
  });
});

describe("CSP framing for /widget (issue #699)", () => {
  it("widget policy allows framing and keeps other directives", () => {
    const csp = buildWidgetCsp({});
    expect(csp).toContain("frame-ancestors *");
    expect(csp).not.toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("selects the widget policy only for /widget paths", () => {
    expect(isWidgetPath("/widget")).toBe(true);
    expect(isWidgetPath("/widget/embed")).toBe(true);
    expect(isWidgetPath("/")).toBe(false);
    expect(isWidgetPath("/widgets")).toBe(false);
  });

  it("proxy sets the right header per path", () => {
    const app = proxy(new NextRequest("http://localhost/"));
    const widget = proxy(new NextRequest("http://localhost/widget"));
    expect(app.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(widget.headers.get("Content-Security-Policy")).toContain("frame-ancestors *");
  });
});
