import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * #900 — ensures claimLock, prepareBatchFunding, submitSignedBatchFunding,
 * and submitTransaction all go through the same-origin proxy and never call
 * API_BASE_URL directly from the browser.
 *
 * The test intercepts `fetch` and asserts that every call made by these
 * functions uses a relative /api/backend/... path — not an absolute URL
 * pointing at the backend.
 */

const fetchMock = vi.fn();

// Must be hoisted before the module under test is imported.
vi.stubGlobal("fetch", fetchMock);

// Importing dynamically so the mock is in place first.
const {
  claimLock,
  prepareBatchFunding,
  submitSignedBatchFunding,
  submitTransaction,
  API_BASE_URL,
} = await import("@/lib/api");

function makeOkResponse(body: object) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("#900 — api.ts proxy-bypass fix", () => {
  it("claimLock fetches a relative /api/backend/... path, not API_BASE_URL", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "lock-1", status: "claimed" }), { status: 200 })
    );

    await claimLock("lock-1", "GADDR", "TESTNET", {
      message: "msg",
      signature: "sig",
      signerAddress: "GADDR",
    });

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe("/api/backend/locks/lock-1/claim");
    expect(calledUrl).not.toContain(API_BASE_URL);
  });

  it("prepareBatchFunding fetches a relative /api/backend/... path, not API_BASE_URL", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ xdr: "unsigned-xdr" }), { status: 200 })
    );

    await prepareBatchFunding(
      "GFROM",
      [{ address: "CDEST", amount: "10" }],
      "TESTNET"
    );

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe("/api/backend/batch-fund/prepare");
    expect(calledUrl).not.toContain(API_BASE_URL);
    // Old wrong path must not appear.
    expect(calledUrl).not.toContain("/api/v1/fund/batch/prepare");
  });

  it("submitSignedBatchFunding fetches a relative /api/backend/... path, not API_BASE_URL", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ results: [{ address: "CDEST", amount: "10", success: true }] }),
        { status: 200 }
      )
    );

    await submitSignedBatchFunding("signed-xdr", "TESTNET");

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe("/api/backend/batch-fund");
    expect(calledUrl).not.toContain(API_BASE_URL);
    expect(calledUrl).not.toContain("/api/v1/fund/batch");
  });

  it("submitTransaction fetches a relative /api/backend/... path, not API_BASE_URL", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: "tx-1", status: "pending", xdr: "signed-xdr", network: "TESTNET", timestamp: new Date().toISOString() }),
        { status: 200 }
      )
    );

    await submitTransaction("signed-xdr", "TESTNET");

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe("/api/backend/transactions");
    expect(calledUrl).not.toContain(API_BASE_URL);
  });
});
