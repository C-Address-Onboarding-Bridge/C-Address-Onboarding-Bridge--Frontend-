import { describe, it, expect } from "vitest";
import {
  bestQuote,
  buildEstimatedQuote,
  compareOnrampQuotes,
  formatQuoteFeeRate,
  isWithinLimits,
  parseProviderLimits,
  quoteSpread,
  rankQuotes,
  type OnrampQuoteComparison,
} from "../onrampQuotes";

describe("parseProviderLimits", () => {
  it("parses the standard '$min - $max' shape", () => {
    expect(parseProviderLimits("$20 - $10,000")).toEqual({ min: 20, max: 10000 });
    expect(parseProviderLimits("$15 - $25,000")).toEqual({ min: 15, max: 25000 });
  });

  it("returns null for an unparseable string", () => {
    expect(parseProviderLimits("no limits")).toBeNull();
    expect(parseProviderLimits("")).toBeNull();
  });
});

describe("isWithinLimits", () => {
  const limits = { min: 20, max: 10000 };

  it("is true at and between the bounds, inclusive", () => {
    expect(isWithinLimits(20, limits)).toBe(true);
    expect(isWithinLimits(10000, limits)).toBe(true);
    expect(isWithinLimits(500, limits)).toBe(true);
  });

  it("is false outside the bounds", () => {
    expect(isWithinLimits(19.99, limits)).toBe(false);
    expect(isWithinLimits(10000.01, limits)).toBe(false);
  });

  it("is null (unknown, not unlimited) when limits are null", () => {
    expect(isWithinLimits(500, null)).toBeNull();
  });
});

describe("buildEstimatedQuote", () => {
  it("computes moonpay's 4.5% fee against the requested amount", () => {
    const q = buildEstimatedQuote("moonpay", 100, "USD", 1_000_000);
    expect(q.provider).toBe("moonpay");
    expect(q.source).toBe("estimated");
    expect(q.quotedAt).toBe(1_000_000);
    expect(q.fee).toBe("4.50");
    expect(q.destinationAmount).toBe("95.50");
    expect(q.cryptoCurrency).toBe("USDC");
    expect(q.withinLimits).toBe(true);
  });

  it("computes transak's 5% fee against the requested amount", () => {
    const q = buildEstimatedQuote("transak", 100, "USD");
    expect(q.fee).toBe("5.00");
    expect(q.destinationAmount).toBe("95.00");
  });

  it("flags an amount below a provider's minimum as not within limits", () => {
    const q = buildEstimatedQuote("moonpay", 5, "USD");
    expect(q.withinLimits).toBe(false);
  });
});

describe("rankQuotes", () => {
  function quote(destinationAmount: string): OnrampQuoteComparison {
    return {
      provider: "moonpay",
      providerName: "Moonpay",
      sourceAmount: "100",
      destinationAmount,
      fee: "0",
      fiatCurrency: "USD",
      cryptoCurrency: "USDC",
      source: "estimated",
      quotedAt: 0,
      rank: 0,
      isBest: false,
      limits: null,
      withinLimits: null,
    };
  }

  it("ranks strictly descending quotes 1, 2, 3", () => {
    const [a, b, c] = rankQuotes([quote("90"), quote("95"), quote("100")]);
    // input order preserved by value, but ranks/isBest reflect sorted position
    expect(rankQuotes([quote("90"), quote("95"), quote("100")]).map((q) => q.destinationAmount)).toEqual([
      "100",
      "95",
      "90",
    ]);
    const sorted = rankQuotes([quote("90"), quote("95"), quote("100")]);
    expect(sorted.map((q) => q.rank)).toEqual([1, 2, 3]);
    expect(sorted.map((q) => q.isBest)).toEqual([true, false, false]);
    void a;
    void b;
    void c;
  });

  it("uses dense ranking so tied quotes share a rank and the next rank doesn't skip", () => {
    const sorted = rankQuotes([quote("95"), quote("95"), quote("90")]);
    expect(sorted.map((q) => q.rank)).toEqual([1, 1, 2]);
    expect(sorted.map((q) => q.isBest)).toEqual([true, true, false]);
  });

  it("marks every provider best in an all-tied comparison", () => {
    const sorted = rankQuotes([quote("50"), quote("50")]);
    expect(sorted.every((q) => q.isBest)).toBe(true);
  });

  it("does not mutate its input", () => {
    const input = [quote("90"), quote("100")];
    const before = input.map((q) => ({ ...q }));
    rankQuotes(input);
    expect(input).toEqual(before);
  });
});

describe("compareOnrampQuotes", () => {
  it("ranks moonpay above transak for a plain USD amount (lower fee rate wins)", () => {
    const comparisons = compareOnrampQuotes(100, "USD");
    expect(comparisons).toHaveLength(2);
    expect(comparisons[0].provider).toBe("moonpay");
    expect(comparisons[0].isBest).toBe(true);
    expect(comparisons[1].provider).toBe("transak");
    expect(comparisons[1].isBest).toBe(false);
  });

  it("excludes providers that don't support the requested currency", () => {
    // Only Transak supports INR.
    const comparisons = compareOnrampQuotes(100, "INR");
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].provider).toBe("transak");
  });

  it("returns an empty comparison for a non-positive or non-finite amount", () => {
    expect(compareOnrampQuotes(0, "USD")).toEqual([]);
    expect(compareOnrampQuotes(-5, "USD")).toEqual([]);
    expect(compareOnrampQuotes(NaN, "USD")).toEqual([]);
  });

  it("uses a supplied live quote instead of the estimate, tagged source: live", () => {
    const comparisons = compareOnrampQuotes(100, "USD", {
      liveQuotes: {
        transak: { sourceAmount: "100", destinationAmount: "99.00", fee: "1.00" },
      },
    });
    const transak = comparisons.find((q) => q.provider === "transak");
    const moonpay = comparisons.find((q) => q.provider === "moonpay");
    expect(transak?.source).toBe("live");
    expect(transak?.destinationAmount).toBe("99.00");
    // A live quote for one provider doesn't disturb the other's estimate.
    expect(moonpay?.source).toBe("estimated");
    // With the live figure, transak now out-ranks moonpay's 95.50 estimate.
    expect(transak?.isBest).toBe(true);
  });

  it("falls back to the estimate when a provider has no live quote (failure isolation)", () => {
    // Simulates /api/onramp/quotes returning a live quote for only one
    // provider because the other's fetch failed or timed out upstream.
    const comparisons = compareOnrampQuotes(100, "USD", {
      liveQuotes: { moonpay: { sourceAmount: "100", destinationAmount: "96.00", fee: "4.00" } },
    });
    const transak = comparisons.find((q) => q.provider === "transak");
    expect(transak?.source).toBe("estimated");
    expect(transak?.destinationAmount).toBe("95.00");
  });

  it("ties both providers when their receive amounts are equal", () => {
    const comparisons = compareOnrampQuotes(100, "USD", {
      liveQuotes: {
        transak: { sourceAmount: "100", destinationAmount: "95.50", fee: "4.50" },
      },
    });
    expect(comparisons.every((q) => q.rank === 1 && q.isBest)).toBe(true);
  });
});

describe("bestQuote", () => {
  it("returns the top-ranked entry", () => {
    const comparisons = compareOnrampQuotes(100, "USD");
    expect(bestQuote(comparisons)?.provider).toBe("moonpay");
  });

  it("returns null for an empty comparison", () => {
    expect(bestQuote([])).toBeNull();
  });
});

describe("quoteSpread", () => {
  it("is null with fewer than two quotes", () => {
    expect(quoteSpread([])).toBeNull();
    expect(quoteSpread(compareOnrampQuotes(100, "INR"))).toBeNull(); // only transak supports INR
  });

  it("computes the absolute and percentage gap between best and worst", () => {
    const spread = quoteSpread(compareOnrampQuotes(100, "USD"));
    expect(spread).not.toBeNull();
    expect(spread!.absolute).toBeCloseTo(0.5, 5); // 95.50 - 95.00
    expect(spread!.percent).toBeCloseTo((0.5 / 95.5) * 100, 5);
  });
});

describe("formatQuoteFeeRate", () => {
  it("formats each provider's fee rate as a percentage", () => {
    expect(formatQuoteFeeRate("moonpay")).toBe("4.50%");
    expect(formatQuoteFeeRate("transak")).toBe("5.00%");
  });
});
