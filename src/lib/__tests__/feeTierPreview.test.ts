import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Tests for getFeeTierPreview (#673) — now backed by an on-chain volume
 * read (getRebateVolume) mapped onto the tier ladder (buildFeeTierStatus),
 * not a /fee-tiers/preview backend route that never existed.
 */

const getRebateVolumeMock = vi.fn();

vi.mock("../stellar", () => ({
  getRebateVolume: getRebateVolumeMock,
}));

afterEach(() => {
  getRebateVolumeMock.mockReset();
});

describe("getFeeTierPreview", () => {
  it("returns null when getRebateVolume has no data (unconfigured/invalid/RPC failure)", async () => {
    getRebateVolumeMock.mockResolvedValue(null);
    const { getFeeTierPreview } = await import("../api");

    expect(await getFeeTierPreview("GADDRESS", "TESTNET")).toBeNull();
  });

  it("maps a real volume onto the tier ladder", async () => {
    getRebateVolumeMock.mockResolvedValue(4000);
    const { getFeeTierPreview } = await import("../api");

    const status = await getFeeTierPreview("GADDRESS", "TESTNET");
    expect(status?.currentVolume).toBe(4000);
    expect(status?.currentTier.name).toBe("Silver");
    expect(status?.nextTier?.name).toBe("Gold");
  });

  it("passes the address and network through to getRebateVolume unchanged", async () => {
    getRebateVolumeMock.mockResolvedValue(0);
    const { getFeeTierPreview } = await import("../api");

    await getFeeTierPreview("GADDRESS", "PUBLIC");
    expect(getRebateVolumeMock).toHaveBeenCalledWith("GADDRESS", "PUBLIC");
  });
});
