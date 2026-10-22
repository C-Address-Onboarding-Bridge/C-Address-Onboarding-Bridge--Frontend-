/**
 * Tests for #900: claimLock, prepareBatchFunding, submitSignedBatchFunding,
 * and submitTransaction must all route through the server-side proxy
 * (/api/backend/...) and must never call API_BASE_URL directly from the
 * browser.
 *
 * Each test intercepts globalThis.fetch, calls the function under test, and
 * asserts that the URL used starts with /api/backend/ — not with
 * API_BASE_URL (https://api.example.com in test) or any other absolute URL.
 * This is the only meaningful guarantee we can enforce without a real backend:
 * if the function calls the proxy, the server-side handler will attach the key;
 * if it calls API_BASE_URL, the request will always be rejected with 401.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// We deliberately import the real implementations (not mocked) so the URL
// actually used by each function is what we're asserting on.
import {
  claimLock,
  prepareBatchFunding,
  submitSignedBatchFunding,
  submitTransaction,
} from "@/lib/api";

// Minimal stubs for the proof object and types.
const MOCK_PROOF = {
  message: "challenge",
  signature: "sig",
  signerAddress: "GABC",
};

afterEach(() => {
  vi.restoreAllMocks();
});

/** Intercept fetch and return a minimal 200 response with the given body. */
function mockFetch(body: unknown = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("#900 — proxy routing: none of the affected functions call API_BASE_URL directly", () => {
  it("claimLock routes through /api/backend/locks/[id]/claim, not API_BASE_URL", async () => {
    const spy = mockFetch({ id: "lock-1", status: "claimed" });

    await claimLock("lock-1", "GABC", "TESTNET", MOCK_PROOF);

    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^\/api\/backend\/locks\//);
    expect(calledUrl).not.toMatch(/^https?:\/\//);
  });

  it("prepareBatchFunding routes through /api/backend/batch-fund/prepare, not API_BASE_URL", async () => {
    const spy = mockFetch({ xdr: "unsigned-xdr" });

    await prepareBatchFunding("GABC", [{ address: "CABC", amount: "10" }], "TESTNET");

    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toBe("/api/backend/batch-fund/prepare");
    expect(calledUrl).not.toMatch(/^https?:\/\//);
  });

  it("submitSignedBatchFunding routes through /api/backend/batch-fund, not API_BASE_URL", async () => {
    const spy = mockFetch({ results: [] });

    await submitSignedBatchFunding("signed-xdr", "TESTNET");

    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toBe("/api/backend/batch-fund");
    expect(calledUrl).not.toMatch(/^https?:\/\//);
  });

  it("submitTransaction routes through /api/backend/transactions, not API_BASE_URL", async () => {
    const spy = mockFetch({
      id: "tx-1",
      status: "pending",
      hash: "abc",
      amount: "10",
      asset: "XLM",
      fromAddress: "GABC",
      toAddress: "CABC",
      network: "TESTNET",
      timestamp: new Date().toISOString(),
    });

    await submitTransaction("signed-xdr", "TESTNET");

    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toBe("/api/backend/transactions");
    expect(calledUrl).not.toMatch(/^https?:\/\//);
  });
});
