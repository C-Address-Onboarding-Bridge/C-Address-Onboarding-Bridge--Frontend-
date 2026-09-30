import { describe, it, expect, vi, afterEach } from "vitest";
import { prepareBatchFunding, submitSignedBatchFunding } from "../api";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const RECIPIENTS = [
  { address: "C" + "A".repeat(55), amount: "10" },
  { address: "C" + "B".repeat(55), amount: "5" },
];

describe("prepareBatchFunding (#671)", () => {
  it("posts to the prepare endpoint and returns the unsigned XDR", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ xdr: "unsigned-xdr" }),
    });
    global.fetch = fetchMock;

    const result = await prepareBatchFunding("GFROM", RECIPIENTS, "TESTNET");

    expect(result).toEqual({ xdr: "unsigned-xdr" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/fund\/batch\/prepare$/);
    expect(JSON.parse(init.body)).toEqual({ from: "GFROM", network: "TESTNET", recipients: RECIPIENTS });
  });

  it("throws with the backend's error message on a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: "Recipient list is empty" }),
    });
    await expect(prepareBatchFunding("GFROM", RECIPIENTS, "TESTNET")).rejects.toThrow("Recipient list is empty");
  });

  it("throws when the response is missing the xdr to sign", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    await expect(prepareBatchFunding("GFROM", RECIPIENTS, "TESTNET")).rejects.toThrow(/missing the transaction/i);
  });
});

describe("submitSignedBatchFunding (#671)", () => {
  it("posts the signed XDR to the real batch endpoint and returns per-recipient results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{ address: RECIPIENTS[0].address, amount: "10", success: true, hash: "abc" }],
        }),
    });
    global.fetch = fetchMock;

    const result = await submitSignedBatchFunding("signed-xdr", "TESTNET");

    expect(result.results).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/fund\/batch$/);
    expect(url).not.toMatch(/\/prepare$/);
    expect(JSON.parse(init.body)).toEqual({ signedXdr: "signed-xdr", network: "TESTNET" });
  });

  it("throws on a non-2xx response instead of returning a partial result", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
    });
    await expect(submitSignedBatchFunding("signed-xdr", "TESTNET")).rejects.toThrow(/502/);
  });
});
