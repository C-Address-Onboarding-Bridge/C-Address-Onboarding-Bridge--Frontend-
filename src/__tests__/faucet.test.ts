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

    const result = await requestTestXLM(VALID_G_ADDRESS, "TESTNET");
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

    const result = await requestTestXLM(VALID_G_ADDRESS, "TESTNET");
    expect(result.success).toBe(false);
    expect(result.message).toContain("rate-limited");
  });

  it("returns already-funded message for 400 with op_already_exists", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({
          detail: "create_account_already_exist",
          extras: { result_codes: { operations: ["op_already_exists"] } },
        })),
      } as unknown as Response)
    );

    const result = await requestTestXLM(VALID_G_ADDRESS, "TESTNET");
    expect(result.success).toBe(false);
    expect(result.message).toBe("This account is already funded on Testnet.");
  });

  it("returns failure for non-429 error responses", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as unknown as Response)
    );

    const result = await requestTestXLM(VALID_G_ADDRESS, "TESTNET");
    expect(result.success).toBe(false);
    expect(result.message).toContain("500");
  });

  it("returns failure for invalid address", async () => {
    const result = await requestTestXLM("invalid", "TESTNET");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid Stellar address.");
  });

  it("returns failure on network error", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network down")));

    const result = await requestTestXLM(VALID_G_ADDRESS, "TESTNET");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Network error");
  });
});
