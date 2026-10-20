import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

async function loadMiddleware() {
  vi.resetModules();
  const mod = await import("../middleware");
  return mod.middleware;
}

function getConnectSrc(csp: string): string {
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("connect-src"));
  return directive ?? "";
}

async function runMiddleware(): Promise<string> {
  const middleware = await loadMiddleware();
  const request = new NextRequest("https://example.com/");
  const response = await middleware(request);
  const csp = response.headers.get("content-security-policy") ?? "";
  return getConnectSrc(csp);
}

describe("middleware connect-src", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC;
    delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET;
    delete process.env.NEXT_PUBLIC_HORIZON_URL_PUBLIC;
    delete process.env.NEXT_PUBLIC_HORIZON_URL_TESTNET;
    delete process.env.NEXT_PUBLIC_TRANSACTION_STATUS_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("includes a custom mainnet Soroban RPC origin", async () => {
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC = "https://rpc.example.org";
    const connectSrc = await runMiddleware();
    expect(connectSrc).toContain("https://rpc.example.org");
  });

  it("includes a custom testnet Soroban RPC origin", async () => {
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET = "https://rpc-testnet.example.org";
    const connectSrc = await runMiddleware();
    expect(connectSrc).toContain("https://rpc-testnet.example.org");
  });

  it("includes a custom mainnet Horizon origin", async () => {
    process.env.NEXT_PUBLIC_HORIZON_URL_PUBLIC = "https://horizon.example.org";
    const connectSrc = await runMiddleware();
    expect(connectSrc).toContain("https://horizon.example.org");
  });

  it("includes a custom testnet Horizon origin", async () => {
    process.env.NEXT_PUBLIC_HORIZON_URL_TESTNET = "https://horizon-testnet.example.org";
    const connectSrc = await runMiddleware();
    expect(connectSrc).toContain("https://horizon-testnet.example.org");
  });

  it("includes the transaction status URL origin when set", async () => {
    process.env.NEXT_PUBLIC_TRANSACTION_STATUS_URL = "https://status.example.org/tx";
    const connectSrc = await runMiddleware();
    expect(connectSrc).toContain("https://status.example.org");
  });
});
