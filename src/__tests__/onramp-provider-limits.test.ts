import { describe, it, expect } from "vitest";
import { providers, isWithinProviderLimits } from "@/lib/onrampProviders";

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
