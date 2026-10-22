import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the confirmations API route (#676, #906).
 *
 * Covers:
 *  - Horizon 404 → route returns 404 "Transaction not found"
 *  - Horizon 5xx / network error → route returns 502 (not 404)
 *  - Missing or invalid network query param → 400
 *  - Per-IP rate limit → 429 with Retry-After header
 *  - Happy-path payment confirmation shape
 */

const transactionCallMock = vi.fn();
const operationsCallMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getClientIpMock = vi.fn(() => "127.0.0.1");

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

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));

const VALID_HASH = "a".repeat(64);
const G_FROM = "G" + "A".repeat(55);
const G_TO = "G" + "B".repeat(55);

/** Builds a Horizon-style 404 error (the SDK wraps HTTP errors with a `response` property). */
function makeHorizonError(status: number): unknown {
  return Object.assign(new Error(`Horizon ${status}`), { response: { status } });
}

function makeRequest(hash: string, network?: string): Request {
  const query = network != null ? `?network=${network}` : "";
  return new Request(`http://localhost/api/confirmations/${hash}${query}`);
}

function makeContext(hash: string) {
  return { params: Promise.resolve({ hash }) };
}

describe("GET /api/confirmations/[hash] — #906 security fixes", () => {
  beforeEach(() => {
    transactionCallMock.mockReset();
    operationsCallMock.mockReset();
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockReturnValue({ allowed: true });
    getClientIpMock.mockReturnValue("127.0.0.1");
  });

  // -------------------------------------------------------------------------
  // 400 — bad input
  // -------------------------------------------------------------------------

  it("returns 400 for a malformed hash without calling Horizon", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeRequest("not-a-hash", "TESTNET"), makeContext("not-a-hash"));

    expect(response.status).toBe(400);
    expect(transactionCallMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the network param is missing", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH), makeContext(VALID_HASH));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/invalid network/i);
  });

  it("returns 400 for an unrecognised network value", async () => {
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH, "FUTURENET"), makeContext(VALID_HASH));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/invalid network/i);
  });

  // -------------------------------------------------------------------------
  // 429 — rate limit
  // -------------------------------------------------------------------------

  it("returns 429 with Retry-After when the rate limit is exceeded", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterSeconds: 45 });
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(transactionCallMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 404 — Horizon says the transaction doesn't exist
  // -------------------------------------------------------------------------

  it("returns 404 when Horizon returns 404 for a well-formed hash", async () => {
    transactionCallMock.mockRejectedValue(makeHorizonError(404));
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/not found/i);
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
    const response = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));

    expect(response.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 502 — Horizon is unavailable (not a 404)
  // -------------------------------------------------------------------------

  it("returns 502 when Horizon returns 503 (upstream unavailable)", async () => {
    transactionCallMock.mockRejectedValue(makeHorizonError(503));
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toMatch(/upstream/i);
  });

  it("returns 502 when Horizon returns 429 (rate-limited by Horizon)", async () => {
    transactionCallMock.mockRejectedValue(makeHorizonError(429));
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));

    expect(response.status).toBe(502);
  });

  it("returns 502 on a network-level error (e.g. fetch failed)", async () => {
    transactionCallMock.mockRejectedValue(new TypeError("fetch failed"));
    const { GET } = await import("../route");
    const response = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));

    expect(response.status).toBe(502);
  });

  // -------------------------------------------------------------------------
  // 200 — happy path
  // -------------------------------------------------------------------------

  it("returns the TransactionConfirmation shape for a found XLM payment", async () => {
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
    const response = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));
    const body = await response.json();
    expect(body.status).toBe("failed");
  });

  it("accepts both PUBLIC and TESTNET as valid network values", async () => {
    transactionCallMock.mockRejectedValue(makeHorizonError(404));
    const { GET } = await import("../route");

    const r1 = await GET(makeRequest(VALID_HASH, "TESTNET"), makeContext(VALID_HASH));
    const r2 = await GET(makeRequest(VALID_HASH, "PUBLIC"), makeContext(VALID_HASH));

    // Both reach Horizon (return 404, not 400)
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
  });
});
