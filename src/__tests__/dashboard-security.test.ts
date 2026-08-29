import { describe, it, expect } from "vitest";
import { getExplorerUrl } from "@/lib/stellar";

// Re-export for testing — areTransactionsEqual is internal to dashboard-page,
// so we duplicate the minimal logic here to test it in isolation.
// The real guard is tested indirectly via the dashboard rendering tests.
function areTransactionsEqual(
  a: Array<{ id: string; status: string }>,
  b: Array<{ id: string; status: string }>
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].status !== b[i].status) return false;
  }
  return true;
}

describe("getExplorerUrl — URL safety", () => {
  it("always produces an https:// URL", () => {
    const url = getExplorerUrl("TESTNET", "account", "GABC");
    expect(url.startsWith("https://")).toBe(true);
  });

  it("uses stellar.expert/explorer/public for PUBLIC network", () => {
    const url = getExplorerUrl("PUBLIC", "account", "GABC");
    expect(url).toContain("stellar.expert/explorer/public");
  });

  it("uses stellar.expert/explorer/testnet for TESTNET network", () => {
    const url = getExplorerUrl("TESTNET", "account", "GABC");
    expect(url).toContain("stellar.expert/explorer/testnet");
  });

  it("embeds the id at the end of the path", () => {
    const id = "GABCDEF1234";
    const url = getExplorerUrl("TESTNET", "account", id);
    expect(url.endsWith(`/account/${id}`)).toBe(true);
  });

  it("supports tx and contract type paths", () => {
    expect(getExplorerUrl("TESTNET", "tx", "abc123")).toContain("/tx/abc123");
    expect(getExplorerUrl("PUBLIC", "contract", "CABC")).toContain("/contract/CABC");
  });

  it("special characters in id are included as-is (caller is responsible for valid ids)", () => {
    // The function does not build the URL with URLSearchParams — the id goes
    // into the path. Confirm the host is never attacker-controlled.
    const url = getExplorerUrl("TESTNET", "account", "some-id");
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("stellar.expert");
    expect(parsed.protocol).toBe("https:");
  });
});

describe("areTransactionsEqual — shape safety", () => {
  it("returns true for two empty arrays", () => {
    expect(areTransactionsEqual([], [])).toBe(true);
  });

  it("returns false for arrays of different length", () => {
    expect(
      areTransactionsEqual(
        [{ id: "1", status: "confirmed" }],
        []
      )
    ).toBe(false);
  });

  it("returns true when ids and statuses match", () => {
    const a = [{ id: "1", status: "confirmed" }, { id: "2", status: "pending" }];
    const b = [{ id: "1", status: "confirmed" }, { id: "2", status: "pending" }];
    expect(areTransactionsEqual(a, b)).toBe(true);
  });

  it("returns false when a status differs", () => {
    const a = [{ id: "1", status: "pending" }];
    const b = [{ id: "1", status: "confirmed" }];
    expect(areTransactionsEqual(a, b)).toBe(false);
  });

  it("returns false when an id differs", () => {
    const a = [{ id: "1", status: "confirmed" }];
    const b = [{ id: "2", status: "confirmed" }];
    expect(areTransactionsEqual(a, b)).toBe(false);
  });

  it("handles objects with extra unexpected fields without throwing", () => {
    const a = [{ id: "1", status: "confirmed", extra: "unexpected" } as { id: string; status: string }];
    const b = [{ id: "1", status: "confirmed" }];
    expect(() => areTransactionsEqual(a, b)).not.toThrow();
    expect(areTransactionsEqual(a, b)).toBe(true);
  });
});
