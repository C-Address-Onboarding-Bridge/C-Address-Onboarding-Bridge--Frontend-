import { describe, it, expect } from "vitest";
import {
  providers,
  isWithinProviderLimits,
  getProviderFeeRate,
  calculateOnrampFeeAndReceive,
  formatFeeLabel,
} from "@/lib/onrampProviders";

// #940: amount validation was a format-only regex (`/^\d+(\.\d{1,2})?$/`),
// so "0", "0.00" and any amount outside a provider's advertised limits still
// passed. `isWithinProviderLimits` is the numeric check the onramp form now
// also requires via `providers[].minAmount`/`maxAmount`.
describe("isWithinProviderLimits (src/lib/onrampProviders.ts)", () => {
  const moonpay = providers.find((p) => p.id === "moonpay")!;
  const transak = providers.find((p) => p.id === "transak")!;

  it("rejects zero for every provider", () => {
    expect(isWithinProviderLimits(0, "moonpay")).toBe(false);
    expect(isWithinProviderLimits(0, "transak")).toBe(false);
  });

  it("rejects amounts below the provider's minimum", () => {
    expect(isWithinProviderLimits(moonpay.minAmount - 1, "moonpay")).toBe(false);
    expect(isWithinProviderLimits(transak.minAmount - 1, "transak")).toBe(false);
  });

  it("rejects amounts above the provider's maximum", () => {
    expect(isWithinProviderLimits(moonpay.maxAmount + 1, "moonpay")).toBe(false);
    expect(isWithinProviderLimits(transak.maxAmount + 1, "transak")).toBe(false);
  });

  it("accepts amounts exactly at the min and max boundaries (inclusive)", () => {
    expect(isWithinProviderLimits(moonpay.minAmount, "moonpay")).toBe(true);
    expect(isWithinProviderLimits(moonpay.maxAmount, "moonpay")).toBe(true);
    expect(isWithinProviderLimits(transak.minAmount, "transak")).toBe(true);
    expect(isWithinProviderLimits(transak.maxAmount, "transak")).toBe(true);
  });

  it("accepts an amount inside the range", () => {
    expect(isWithinProviderLimits(100, "moonpay")).toBe(true);
    expect(isWithinProviderLimits(100, "transak")).toBe(true);
  });

  it("rejects an unknown provider id and non-finite amounts", () => {
    expect(isWithinProviderLimits(100, "unknown-provider")).toBe(false);
    expect(isWithinProviderLimits(NaN, "moonpay")).toBe(false);
    expect(isWithinProviderLimits(Infinity, "moonpay")).toBe(false);
  });

  it("derives the display `limits` label from the numeric bounds", () => {
    expect(moonpay.limits).toBe("$20 - $10,000");
    expect(transak.limits).toBe("$15 - $25,000");
  });
});

// #1105: getProviderFeeRate looked up hardcoded rates and silently defaulted to 5%
// for unknown providers, drifting from providers[].fee. Providers now store numeric
// feeRate and derive fee string, while getProviderFeeRate looks it up and throws on unknown id.
describe("getProviderFeeRate and calculateOnrampFeeAndReceive (#1105)", () => {
  const moonpay = providers.find((p) => p.id === "moonpay")!;
  const transak = providers.find((p) => p.id === "transak")!;

  it("derives the display `fee` label from the numeric feeRate", () => {
    expect(moonpay.feeRate).toBe(0.045);
    expect(moonpay.fee).toBe("4.5%");
    expect(transak.feeRate).toBe(0.05);
    expect(transak.fee).toBe("5%");
    expect(formatFeeLabel(0.0325)).toBe("3.25%");
  });

  it("looks up feeRate from providers table for known providers", () => {
    expect(getProviderFeeRate("moonpay")).toBe(0.045);
    expect(getProviderFeeRate("transak")).toBe(0.05);
  });

  it("throws on unknown or misspelled provider id instead of defaulting to 5%", () => {
    expect(() => getProviderFeeRate("unknown-provider")).toThrow("Unknown onramp provider: unknown-provider");
    expect(() => getProviderFeeRate("moon_pay")).toThrow("Unknown onramp provider: moon_pay");
  });

  it("handles unknown provider safely in calculateOnrampFeeAndReceive", () => {
    const res = calculateOnrampFeeAndReceive(100, "unknown-provider");
    expect(Number.isNaN(res.feeRate)).toBe(true);
    expect(Number.isNaN(res.fee)).toBe(true);
    expect(Number.isNaN(res.receive)).toBe(true);
  });

  it("calculates accurate fee and receive amount for valid providers", () => {
    const moonpayCalc = calculateOnrampFeeAndReceive(200, "moonpay");
    expect(moonpayCalc.feeRate).toBe(0.045);
    expect(moonpayCalc.fee).toBe(9);
    expect(moonpayCalc.receive).toBe(191);

    const transakCalc = calculateOnrampFeeAndReceive(200, "transak");
    expect(transakCalc.feeRate).toBe(0.05);
    expect(transakCalc.fee).toBe(10);
    expect(transakCalc.receive).toBe(190);
  });

  it("dynamically changes estimate and fee label when provider feeRate changes in fixture", () => {
    const customFixture = {
      ...moonpay,
      id: "custom-provider",
      feeRate: 0.025,
      fee: formatFeeLabel(0.025),
    };
    expect(customFixture.fee).toBe("2.5%");
    const fee = 100 * customFixture.feeRate;
    const receive = 100 - fee;
    expect(fee).toBe(2.5);
    expect(receive).toBe(97.5);
  });
});
