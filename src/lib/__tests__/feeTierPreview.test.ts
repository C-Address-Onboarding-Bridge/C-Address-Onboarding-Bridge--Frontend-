import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Tests for getFeeTierPreview (#903 / #673) — backed by an on-chain volume
 * read (getRebateVolume) mapped onto the tier ladder (buildFeeTierStatus),
 * not a /referrals/stats proxy endpoint.
 */

const getRebateVolumeMock = vi.fn();

vi.mock("../stellar", () => ({
  getRebateVolume: getRebateVolumeMock,
}));

afterEach(() => {
  getRebateVolumeMock.mockReset();
});

describe("getFeeTierPreview", () => {
  it("returns null when getRebateVolume returns null (unconfigured/RPC failure)", async () => {
    getRebateVolumeMock.mockResolvedValue(null);
    const { getFeeTierPreview } = await import("../api");

    expect(await getFeeTierPreview("GADDRESS", "TESTNET")).toBeNull();
  });

  it("volume 5000 → Silver tier with Gold as nextTier", async () => {
    getRebateVolumeMock.mockResolvedValue(5000);
    const { getFeeTierPreview } = await import("../api");

    const status = await getFeeTierPreview("GADDRESS", "TESTNET");
    expect(status).not.toBeNull();
    expect(status?.currentVolume).toBe(5000);
    expect(status?.currentTier.name).toBe("Silver");
    expect(status?.nextTier?.name).toBe("Gold");
  });

  it("maps a volume below Silver threshold to the Base tier", async () => {
    getRebateVolumeMock.mockResolvedValue(500);
    const { getFeeTierPreview } = await import("../api");

    const status = await getFeeTierPreview("GADDRESS", "TESTNET");
    expect(status?.currentTier.name).toBe("Base");
    expect(status?.nextTier?.name).toBe("Silver");
  });

  it("maps a volume at or above Gold threshold to the Gold tier with no next tier", async () => {
    getRebateVolumeMock.mockResolvedValue(10000);
    const { getFeeTierPreview } = await import("../api");

    const status = await getFeeTierPreview("GADDRESS", "TESTNET");
    expect(status?.currentTier.name).toBe("Gold");
    expect(status?.nextTier).toBeNull();
  });

  it("passes the address and network through to getRebateVolume unchanged", async () => {
    getRebateVolumeMock.mockResolvedValue(0);
    const { getFeeTierPreview } = await import("../api");

    await getFeeTierPreview("GADDRESS", "PUBLIC");
    expect(getRebateVolumeMock).toHaveBeenCalledWith("GADDRESS", "PUBLIC");
  });

  it("returns null when getRebateVolume throws", async () => {
    getRebateVolumeMock.mockRejectedValue(new Error("RPC unavailable"));
    const { getFeeTierPreview } = await import("../api");

    expect(await getFeeTierPreview("GADDRESS", "TESTNET")).toBeNull();
  });
});
