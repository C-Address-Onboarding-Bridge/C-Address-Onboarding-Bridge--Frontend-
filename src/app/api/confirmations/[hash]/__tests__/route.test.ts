import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the confirmations API route (#676).
 *
 * fetchConfirmation in src/app/confirm/[hash]/page.tsx requested
 * /api/confirmations/${hash}, but no such route existed — this is the route,
 * and these are the found/not-found/invalid-hash cases its checklist asks
 * for. Mocks @stellar/stellar-sdk's Horizon.Server the same way
 * stellar-signing-guards.test.ts does, so no real network call is made.
 */

const transactionCallMock = vi.fn();
const operationsCallMock = vi.fn();

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.transactions = () => ({
          transaction: () => ({ call: transactionCallMock }),
        });
        this.operations = () => ({
          forTransaction: () => ({ call: operationsCallMock }),
        });
      }),
    },
  };
});

const VALID_HASH = "a".repeat(64);
const G_FROM = "G" + "A".repeat(55);
const G_TO = "G" + "B".repeat(55);

function makeRequest(hash: string, network?: string): Request {
  const query = network ? `?network=${network}` : "";
  return new Request(`http://localhost/api/confirmations/${hash}${query}`);
}

function makeContext(hash: string) {
  return { params: Promise.resolve({ hash }) };
}

describe("GET /api/confirmations/[hash] (#676)", () => {
  beforeEach(() => {
    transactionCallMock.mockReset();
    operationsCallMock.mockReset();
  });

  it("returns 400 for a malformed hash without ever calling Horizon", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeRequest("not-a-hash"), makeContext("not-a-hash"));

    expect(response.status).toBe(400);
    expect(transactionCallMock).not.toHaveBeenCalled();
  });

  it("returns 404 when Horizon has no record for a well-formed hash", async () => {
    transactionCallMock.mockRejectedValue(new Error("Not Found"));
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH), makeContext(VALID_HASH));

    expect(response.status).toBe(404);
  });

  it("returns 404 when the transaction has no payment operation", async () => {
    transactionCallMock.mockResolvedValue({
      hash: VALID_HASH,
      successful: true,
      created_at: "2026-01-01T00:00:00Z",
      fee_charged: "100",
    });
    operationsCallMock.mockResolvedValue({ records: [{ type: "create_account" }] });
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH), makeContext(VALID_HASH));

    expect(response.status).toBe(404);
  });

  it("returns the TransactionConfirmation shape for a found payment", async () => {
    transactionCallMock.mockResolvedValue({
      hash: VALID_HASH,
      successful: true,
      created_at: "2026-01-01T00:00:00.000Z",
      fee_charged: "100",
    });
    operationsCallMock.mockResolvedValue({
      records: [
        {
          type: "payment",
          from: G_FROM,
          to: G_TO,
          amount: "10.0000000",
          asset_type: "native",
        },
      ],
    });

    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH, "PUBLIC"), makeContext(VALID_HASH));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      hash: VALID_HASH,
      amount: "10.0000000",
      asset: "XLM",
      timestamp: new Date("2026-01-01T00:00:00.000Z").getTime(),
      fromAddress: G_FROM,
      toAddress: G_TO,
      fee: "0.00001",
      status: "success",
    });
  });

  it("maps a failed transaction's status accordingly", async () => {
    transactionCallMock.mockResolvedValue({
      hash: VALID_HASH,
      successful: false,
      created_at: "2026-01-01T00:00:00.000Z",
      fee_charged: "100",
    });
    operationsCallMock.mockResolvedValue({
      records: [{ type: "payment", from: G_FROM, to: G_TO, amount: "5", asset_type: "native" }],
    });

    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH), makeContext(VALID_HASH));
    const body = await response.json();
    expect(body.status).toBe("failed");
  });

  it("defaults to TESTNET when no network query param is given", async () => {
    transactionCallMock.mockRejectedValue(new Error("Not Found"));
    const { GET } = await import("../route");
    await GET(makeRequest(VALID_HASH), makeContext(VALID_HASH));

    // No network param supplied above — this just documents that the route
    // still resolves (falls back rather than throwing) with a missing param.
    expect(transactionCallMock).toHaveBeenCalled();
  });
});
