// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_FEE_STROOPS,
  MIN_BASE_FEE_STROOPS,
  computeFeeBid,
  getEstimatedFeeXLM,
  getMaxFeeStroops,
  getRecommendedFee,
  type HorizonFeeStats,
} from "@/lib/stellar";

/** A Horizon /fee_stats payload during surge pricing. */
const SURGE: HorizonFeeStats = {
  last_ledger_base_fee: "100",
  fee_charged: { p50: "1500", p70: "2500", p80: "4000", p90: "8000", p95: "20000", p99: "500000" },
};

const QUIET: HorizonFeeStats = {
  last_ledger_base_fee: "100",
  fee_charged: { p50: "100", p70: "100", p80: "100", p90: "100", p95: "100", p99: "120" },
};

function mockFeeStats(body: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("computeFeeBid (#758)", () => {
  it("bids the p70 charged fee, not a multiple of the base fee", () => {
    // The old bid was min(100 * 2, 10_000) = 200 here, far below the market.
    expect(computeFeeBid(SURGE)).toBe(2500);
  });

  it("bids the requested percentile", () => {
    expect(computeFeeBid(SURGE, { percentile: "p90" })).toBe(8000);
    expect(computeFeeBid(SURGE, { percentile: "p50" })).toBe(1500);
  });

  it("caps the bid at the ceiling", () => {
    expect(computeFeeBid(SURGE, { percentile: "p99" })).toBe(DEFAULT_MAX_FEE_STROOPS);
    expect(computeFeeBid(SURGE, { percentile: "p90", maxFeeStroops: 5000 })).toBe(5000);
  });

  it("never bids below the ledger base fee", () => {
    expect(
      computeFeeBid({ last_ledger_base_fee: "300", fee_charged: { p70: "150" } })
    ).toBe(300);
  });

  it("bids the base fee when the network is quiet", () => {
    expect(computeFeeBid(QUIET)).toBe(100);
  });

  it("falls back to the base fee when percentiles are missing or malformed", () => {
    expect(computeFeeBid({ last_ledger_base_fee: "250" })).toBe(250);
    expect(computeFeeBid({ last_ledger_base_fee: "250", fee_charged: { p70: "abc" } })).toBe(250);
    expect(computeFeeBid({ last_ledger_base_fee: "250", fee_charged: { p70: "-5" } })).toBe(250);
    expect(computeFeeBid({})).toBe(MIN_BASE_FEE_STROOPS);
  });

  it("never lets the ceiling drop below the minimum base fee", () => {
    expect(computeFeeBid(SURGE, { maxFeeStroops: 10 })).toBe(MIN_BASE_FEE_STROOPS);
  });
});

describe("getMaxFeeStroops (#758)", () => {
  it("defaults when unset or invalid", () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_FEE_STROOPS", "");
    expect(getMaxFeeStroops()).toBe(DEFAULT_MAX_FEE_STROOPS);
    vi.stubEnv("NEXT_PUBLIC_MAX_FEE_STROOPS", "lots");
    expect(getMaxFeeStroops()).toBe(DEFAULT_MAX_FEE_STROOPS);
    vi.stubEnv("NEXT_PUBLIC_MAX_FEE_STROOPS", "50");
    expect(getMaxFeeStroops()).toBe(DEFAULT_MAX_FEE_STROOPS);
  });

  it("reads a configured ceiling", () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_FEE_STROOPS", "3000");
    expect(getMaxFeeStroops()).toBe(3000);
    expect(computeFeeBid(SURGE, { percentile: "p90" })).toBe(3000);
  });
});

describe("getRecommendedFee with mocked fee stats (#758)", () => {
  it("requests /fee_stats and returns the percentile bid", async () => {
    const fetchSpy = mockFeeStats(SURGE);
    await expect(getRecommendedFee("TESTNET")).resolves.toBe("2500");
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/fee_stats$/);
  });

  it("passes options through", async () => {
    mockFeeStats(SURGE);
    await expect(getRecommendedFee("PUBLIC", { percentile: "p90" })).resolves.toBe("8000");
  });

  it("falls back to the minimum fee when Horizon fails", async () => {
    mockFeeStats({}, false);
    await expect(getRecommendedFee("TESTNET")).resolves.toBe(String(MIN_BASE_FEE_STROOPS));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    await expect(getRecommendedFee("TESTNET")).resolves.toBe(String(MIN_BASE_FEE_STROOPS));
  });

  it("shows the chosen fee on the review screen in XLM", async () => {
    mockFeeStats(SURGE);
    await expect(getEstimatedFeeXLM("TESTNET")).resolves.toBe("~0.00025 XLM");
  });
});
