import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { requestTestXLM } from "@/lib/stellar";

const keypair = Keypair.random();
const VALID_G_ADDRESS = keypair.publicKey();

describe("requestTestXLM", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns success when faucet responds 200", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ hash: "abc123def456789" }),
      } as Response)
    );

    const result = await requestTestXLM(VALID_G_ADDRESS);
    expect(result.success).toBe(true);
    expect(result.message).toContain("Test XLM sent!");
    expect(result.message).toContain("abc123de...");
  });

  it("returns rate limit message for 429 response", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
      } as Response)
    );

    const result = await requestTestXLM(VALID_G_ADDRESS);
    expect(result.success).toBe(false);
    expect(result.message).toContain("rate-limited");
  });

  it("returns failure for non-429 error responses", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response)
    );

    const result = await requestTestXLM(VALID_G_ADDRESS);
    expect(result.success).toBe(false);
    expect(result.message).toContain("500");
  });

  it("returns failure for invalid address", async () => {
    const result = await requestTestXLM("invalid");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid Stellar address.");
  });

  it("returns failure on network error", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network down")));

    const result = await requestTestXLM(VALID_G_ADDRESS);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Network error");
  });
});
