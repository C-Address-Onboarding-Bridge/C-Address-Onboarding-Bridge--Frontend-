import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTransactionExportPage } from "../api";

/**
 * Tests for #932: `transaction-export.tsx` imports `fetchTransactionExportPage`
 * and `ExportFormat` from `@/lib/api`, but neither was exported there, so
 * `TransactionExportControl` (rendered in the dashboard's history card)
 * couldn't build. These cover the real paginated fetch helper now added —
 * the component-level test in `src/__tests__/transaction-export.test.tsx`
 * mocks this module entirely, so it never exercised this implementation.
 */

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const ADDRESS = "G" + "A".repeat(55);

describe("fetchTransactionExportPage (#932)", () => {
  it("requests the export endpoint with address/network/from/to as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [], nextCursor: null, totalCount: 0 }),
    });
    global.fetch = fetchMock;

    await fetchTransactionExportPage({
      address: ADDRESS,
      network: "TESTNET",
      from: 1700000000000,
      to: 1700100000000,
    });

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toMatch(/\/api\/v1\/transactions\/export$/);
    expect(parsed.searchParams.get("address")).toBe(ADDRESS);
    expect(parsed.searchParams.get("network")).toBe("TESTNET");
    expect(parsed.searchParams.get("from")).toBe("1700000000000");
    expect(parsed.searchParams.get("to")).toBe("1700100000000");
    expect(parsed.searchParams.has("cursor")).toBe(false);
  });

  it("includes the cursor on subsequent pages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [], nextCursor: null, totalCount: 0 }),
    });
    global.fetch = fetchMock;

    await fetchTransactionExportPage({
      address: ADDRESS,
      network: "TESTNET",
      from: 0,
      to: 1,
      cursor: "page-2-cursor",
    });

    const [url] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("cursor")).toBe("page-2-cursor");
  });

  it("returns rows, nextCursor, and totalCount from a successful response", async () => {
    const row = {
      id: "tx-1",
      fromAddress: ADDRESS,
      toAddress: "C" + "B".repeat(55),
      amount: "10",
      asset: "XLM",
      status: "confirmed",
      timestamp: 1700000000000,
      type: "g-to-c",
      hash: "hash-1",
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [row], nextCursor: "next-page", totalCount: 42 }),
    });

    const page = await fetchTransactionExportPage({
      address: ADDRESS,
      network: "TESTNET",
      from: 0,
      to: 1,
    });

    expect(page).toEqual({ rows: [row], nextCursor: "next-page", totalCount: 42 });
  });

  it("defaults nextCursor to null and totalCount to null when the response omits them", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [] }),
    });

    const page = await fetchTransactionExportPage({
      address: ADDRESS,
      network: "TESTNET",
      from: 0,
      to: 1,
    });

    expect(page.nextCursor).toBeNull();
    expect(page.totalCount).toBeNull();
  });

  it("throws a clear error when the response is missing rows entirely", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(
      fetchTransactionExportPage({ address: ADDRESS, network: "TESTNET", from: 0, to: 1 })
    ).rejects.toThrow(/missing its rows/);
  });

  it("throws with the backend's error message on a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "No export endpoint configured" }),
    });

    await expect(
      fetchTransactionExportPage({ address: ADDRESS, network: "TESTNET", from: 0, to: 1 })
    ).rejects.toThrow("No export endpoint configured");
  });
});
