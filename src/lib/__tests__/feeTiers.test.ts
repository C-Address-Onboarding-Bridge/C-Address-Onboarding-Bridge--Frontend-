import { describe, it, expect } from "vitest";
import {
  computeTieredFee,
  formatFeeRate,
  hasConfiguredTiers,
  isTopTier,
  progressToNextTier,
  type FeeTier,
  type FeeTierStatus,
} from "../feeTiers";

const BASE: FeeTier = { name: "Base", volumeThreshold: 0, feeRate: 0.005 };
const SILVER: FeeTier = { name: "Silver", volumeThreshold: 1000, feeRate: 0.003 };
const GOLD: FeeTier = { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 };

const intermediateStatus: FeeTierStatus = {
  currentVolume: 4000,
  currentTier: SILVER,
  nextTier: GOLD,
  tiers: [BASE, SILVER, GOLD],
};

const topStatus: FeeTierStatus = {
  currentVolume: 15000,
  currentTier: GOLD,
  nextTier: null,
  tiers: [BASE, SILVER, GOLD],
};

describe("hasConfiguredTiers", () => {
  it("is false for null or undefined", () => {
    expect(hasConfiguredTiers(null)).toBe(false);
    expect(hasConfiguredTiers(undefined)).toBe(false);
  });

  it("is false for an empty tiers array", () => {
    expect(hasConfiguredTiers({ ...topStatus, tiers: [] })).toBe(false);
  });

  it("is true when at least one tier is configured", () => {
    expect(hasConfiguredTiers(intermediateStatus)).toBe(true);
  });
});

describe("isTopTier", () => {
  it("is true when nextTier is null", () => {
    expect(isTopTier(topStatus)).toBe(true);
  });

  it("is false when a next tier exists", () => {
    expect(isTopTier(intermediateStatus)).toBe(false);
  });
});

describe("progressToNextTier", () => {
  it("returns null at the top tier — nothing to progress toward", () => {
    expect(progressToNextTier(topStatus)).toBeNull();
  });

  it("computes percent progress between the current and next tier's thresholds", () => {
    // 4000 is 3000 of the way from Silver's 1000 to Gold's 10000 (span 9000) -> ~33.3%
    const result = progressToNextTier(intermediateStatus);
    expect(result).toEqual({
      currentVolume: 4000,
      nextThreshold: 10000,
      percent: expect.closeTo(33.33, 1),
    });
  });

  it("clamps at 0 when volume is below the current tier's own threshold (defensive)", () => {
    const status: FeeTierStatus = { ...intermediateStatus, currentVolume: 500 };
    expect(progressToNextTier(status)?.percent).toBe(0);
  });

  it("clamps at 100 when volume already meets or exceeds the next threshold", () => {
    const status: FeeTierStatus = { ...intermediateStatus, currentVolume: 20000 };
    expect(progressToNextTier(status)?.percent).toBe(100);
  });

  it("is 0 at exactly the current tier's threshold", () => {
    const status: FeeTierStatus = { ...intermediateStatus, currentVolume: SILVER.volumeThreshold };
    expect(progressToNextTier(status)?.percent).toBe(0);
  });
});

describe("formatFeeRate", () => {
  it("renders a fraction as a percentage with two decimal places", () => {
    expect(formatFeeRate(0.005)).toBe("0.50%");
    expect(formatFeeRate(0.001)).toBe("0.10%");
    expect(formatFeeRate(0)).toBe("0.00%");
  });

  it("renders a rate needing rounding", () => {
    expect(formatFeeRate(0.001234)).toBe("0.12%");
  });
});

describe("computeTieredFee", () => {
  it("multiplies the amount by the current tier's rate, not a flat rate", () => {
    expect(computeTieredFee(1000, intermediateStatus)).toBeCloseTo(3); // 1000 * 0.003
    expect(computeTieredFee(1000, topStatus)).toBeCloseTo(1); // 1000 * 0.001
  });

  it("returns 0 for a non-positive or non-finite amount instead of NaN", () => {
    expect(computeTieredFee(0, intermediateStatus)).toBe(0);
    expect(computeTieredFee(-5, intermediateStatus)).toBe(0);
    expect(computeTieredFee(NaN, intermediateStatus)).toBe(0);
  });
});
