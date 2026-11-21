import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, MAX_ADDRESS_LENGTH, MAX_AMOUNT_LENGTH, MAX_ASSET_CODE_LENGTH } from "@/app/api/simulate/route";
import { Keypair } from "@stellar/stellar-sdk";
import { simulateBridgeTransaction, getAccountBalances } from "@/lib/stellar";

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    simulateBridgeTransaction: vi.fn(async () => ({
      ok: true,
      predictedFee: "0.00001",
      netAmount: "10.0000000",
      recipient: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    })),
  };
});

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

const validGAddress = Keypair.random().publicKey();
const validCAddress = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

describe("/api/simulate route (#1113)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: unknown): Request => {
    return new Request("http://localhost:3000/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  };

  it("returns 400 when sourceAddress is malformed", async () => {
    const req = createRequest({
      sourceAddress: "malformed-not-a-g-address",
      destinationAddress: validCAddress,
      amount: "10",
      assetCode: "XLM",
      network: "TESTNET",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid source address");
    expect(simulateBridgeTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when destinationAddress is malformed", async () => {
    const req = createRequest({
      sourceAddress: validGAddress,
      destinationAddress: "invalid-dest",
      amount: "10",
      assetCode: "XLM",
      network: "TESTNET",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid destination address");
    expect(simulateBridgeTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when input string lengths exceed caps", async () => {
    const longAddress = "G" + "A".repeat(MAX_ADDRESS_LENGTH);
    const req = createRequest({
      sourceAddress: longAddress,
      destinationAddress: validCAddress,
      amount: "10",
      assetCode: "XLM",
      network: "TESTNET",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/exceeds maximum allowed length|Invalid/);
  });

  it("returns 400 when amount exceeds MAX_AMOUNT_LENGTH", async () => {
    const req = createRequest({
      sourceAddress: validGAddress,
      destinationAddress: validCAddress,
      amount: "1".repeat(MAX_AMOUNT_LENGTH + 1),
      assetCode: "XLM",
      network: "TESTNET",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when assetCode exceeds MAX_ASSET_CODE_LENGTH", async () => {
    const req = createRequest({
      sourceAddress: validGAddress,
      destinationAddress: validCAddress,
      amount: "10",
      assetCode: "A".repeat(MAX_ASSET_CODE_LENGTH + 1),
      network: "TESTNET",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body or missing parameters", async () => {
    const req = createRequest({ invalid: "data" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid network parameter", async () => {
    const req = createRequest({
      sourceAddress: validGAddress,
      destinationAddress: validCAddress,
      amount: "10",
      assetCode: "XLM",
      network: "MAINNET",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with simulation result when inputs are valid", async () => {
    const req = createRequest({
      sourceAddress: validGAddress,
      destinationAddress: validCAddress,
      amount: "10",
      assetCode: "XLM",
      network: "TESTNET",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(simulateBridgeTransaction).toHaveBeenCalledWith(
      {
        sourceAddress: validGAddress,
        destinationAddress: validCAddress,
        amount: "10",
        assetCode: "XLM",
      },
      "TESTNET"
    );
  });

  it("getAccountBalances throws on invalid address instead of returning fake zero balance", async () => {
    await expect(getAccountBalances("malformed-stellar-address", "TESTNET")).rejects.toThrow(
      "Invalid Stellar address"
    );
  });
});
