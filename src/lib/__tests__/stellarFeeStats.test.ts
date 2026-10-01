import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getRecommendedFee,
  getEstimatedFeeXLM,
  DEFAULT_MAX_FEE_STROOPS,
  type HorizonFeeStats,
} from "@/lib/stellar";

describe("getRecommendedFee — dynamic fee bid using Horizon fee_stats (#758)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockHorizonFeeStats(status: number, data: Partial<HorizonFeeStats> | null) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/fee_stats")) {
        if (status >= 400 || !data) {
          return {
            ok: false,
            status,
            json: async () => ({ error: "error" }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => data,
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });
  }

  it("bids base fee under normal calm network conditions", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      fee_charged: {
        min: "100",
        mode: "100",
        p70: "100",
        p90: "100",
      },
    });

    const fee = await getRecommendedFee("TESTNET");
    expect(fee).toBe("100");
  });

  it("bids p70 market fee during surge pricing conditions", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      fee_charged: {
        min: "100",
        mode: "500",
        p70: "1500",
        p90: "3000",
      },
    });

    const fee = await getRecommendedFee("TESTNET");
    expect(fee).toBe("1500");
  });

  it("supports configurable percentile (e.g. p90)", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      fee_charged: {
        min: "100",
        mode: "500",
        p70: "1500",
        p90: "3000",
      },
    });

    const fee = await getRecommendedFee("TESTNET", { percentile: "p90" });
    expect(fee).toBe("3000");
  });

  it("caps the bid at DEFAULT_MAX_FEE_STROOPS (10,000) under runaway surge pricing", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      fee_charged: {
        min: "1000",
        p70: "25000",
        p90: "50000",
      },
    });

    const fee = await getRecommendedFee("TESTNET");
    expect(fee).toBe(String(DEFAULT_MAX_FEE_STROOPS));
    expect(fee).toBe("10000");
  });

  it("respects a custom configurable ceiling", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      fee_charged: {
        p70: "8000",
      },
    });

    const fee = await getRecommendedFee("TESTNET", { ceilingStroops: 5000 });
    expect(fee).toBe("5000");
  });

  it("never bids lower than the ledger base fee", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "300",
      fee_charged: {
        p70: "150",
      },
    });

    const fee = await getRecommendedFee("TESTNET");
    expect(fee).toBe("300");
  });

  it("falls back to max_fee if fee_charged is missing", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      max_fee: {
        p70: "750",
      },
    });

    const fee = await getRecommendedFee("TESTNET");
    expect(fee).toBe("750");
  });

  it("falls back gracefully to 100 stroops when Horizon returns an error", async () => {
    mockHorizonFeeStats(500, null);

    const fee = await getRecommendedFee("TESTNET");
    expect(fee).toBe("100");
  });

  it("falls back gracefully to 100 stroops when network fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection failed"));

    const fee = await getRecommendedFee("TESTNET");
    expect(fee).toBe("100");
  });

  it("formats estimated fee string in XLM for normal conditions", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      fee_charged: { p70: "100" },
    });

    const est = await getEstimatedFeeXLM("TESTNET");
    expect(est).toBe("~0.00001 XLM");
  });

  it("formats estimated fee string in XLM during surge pricing", async () => {
    mockHorizonFeeStats(200, {
      last_ledger_base_fee: "100",
      fee_charged: { p70: "1500" },
    });

    const est = await getEstimatedFeeXLM("TESTNET");
    expect(est).toBe("~0.00015 XLM");
  });
});
