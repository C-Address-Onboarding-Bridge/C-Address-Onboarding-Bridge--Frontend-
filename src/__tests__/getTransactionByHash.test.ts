import { describe, it, expect, vi, afterEach } from "vitest";

// @stellar/freighter-api is a transitive dep of @creit.tech/stellar-wallets-kit
// and may not be hoisted; mock it so importing stellar.ts doesn't fail. Only
// getTransactionByHash is tested, and it never touches the wallet kit.
vi.mock("@stellar/freighter-api", () => ({
  getNetwork: vi.fn(),
  getAddress: vi.fn(),
  signTransaction: vi.fn(),
  isConnected: vi.fn(),
}));
vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: { init: vi.fn(), getAddress: vi.fn(), getNetwork: vi.fn(), signTransaction: vi.fn() },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FreighterModule: class {},
}));

import { getTransactionByHash } from "@/lib/stellar";

const HASH = "a".repeat(64);

function mockFetchResponse(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function mockFetchReject(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

describe("getTransactionByHash (#912)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns a pending record on 404 (transaction not yet ingested)", async () => {
    global.fetch = mockFetchResponse(404) as never;

    const result = await getTransactionByHash(HASH, "TESTNET");

    expect(result).not.toBeNull();
    expect(result?.status).toBe("pending");
    expect(result?.hash).toBe(HASH);
    expect(result?.network).toBe("TESTNET");
  });

  it("rethrows on 503 (Horizon outage) instead of returning pending", async () => {
    // fetchHorizonJson throws an error with response.status = 503
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }) as never;

    await expect(getTransactionByHash(HASH, "TESTNET")).rejects.toThrow(
      /Horizon request failed.*503/,
    );
  });

  it("rethrows on 429 (rate limited) instead of returning pending", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    }) as never;

    await expect(getTransactionByHash(HASH, "TESTNET")).rejects.toThrow(
      /Horizon request failed.*429/,
    );
  });

  it("rethrows on a fetch rejection (network error)", async () => {
    global.fetch = mockFetchReject(new Error("Network error")) as never;

    await expect(getTransactionByHash(HASH, "TESTNET")).rejects.toThrow("Network error");
  });

  it("returns a confirmed record when Horizon responds successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        hash: HASH,
        successful: true,
        created_at: "2024-01-01T00:00:00Z",
        ledger_attr: 12345,
        fee_charged: "100",
        max_fee: "200",
        memo: "",
        source_account_sequence: "42",
      }),
    }) as never;

    const result = await getTransactionByHash(HASH, "TESTNET");

    expect(result?.status).toBe("confirmed");
    expect(result?.hash).toBe(HASH);
  });

  it("returns null for a malformed hash", async () => {
    global.fetch = mockFetchResponse(200) as never;

    const result = await getTransactionByHash("not-a-hash", "TESTNET");

    expect(result).toBeNull();
  });
});
