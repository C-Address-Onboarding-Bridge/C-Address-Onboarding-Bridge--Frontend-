import { describe, it, expect } from "vitest";
import {
  calculateOnrampFeeAndReceive,
  isWithinProviderLimits,
  getProviderLimitsForCurrency,
} from "@/lib/onrampProviders";
import {
  buildEstimatedQuote,
  compareOnrampQuotes,
} from "@/lib/onrampQuotes";

describe("On-ramp currency FX conversion & limits (#943)", () => {
  it("hides estimated USDC output ('estimateAvailable: false') for INR and EUR when no FX rate is configured", () => {
    const inrCalc = calculateOnrampFeeAndReceive(1000, "transak", "INR", {});
    expect(inrCalc.rateAvailable).toBe(false);
    expect(inrCalc.receive).toBeNull();

    const inrQuote = buildEstimatedQuote("transak", 1000, "INR", 1700000000000, {});
    expect(inrQuote.estimateAvailable).toBe(false);
    expect(inrQuote.destinationAmount).toBe("");
    expect(inrQuote.withinLimits).toBeNull();

    const eurQuote = buildEstimatedQuote("moonpay", 100, "EUR", 1700000000000, {});
    expect(eurQuote.estimateAvailable).toBe(false);
    expect(eurQuote.destinationAmount).toBe("");
    expect(eurQuote.withinLimits).toBeNull();
  });

  it("applies FX rates to INR and EUR before calculating USDC received", () => {
    const fxRates = { USD: 1, INR: 0.012, EUR: 1.1 };

    // ₹1,000 * 0.012 = $12.00; minus 5% Transak fee ($0.60) = 11.40 USDC
    const inrQuote = buildEstimatedQuote("transak", 1000, "INR", 1700000000000, fxRates);
    expect(inrQuote.estimateAvailable).toBe(true);
    expect(inrQuote.destinationAmount).toBe("11.40");

    // €100 * 1.1 = $110.00; minus 4.5% MoonPay fee ($4.95) = 105.05 USDC
    const eurQuote = buildEstimatedQuote("moonpay", 100, "EUR", 1700000000000, fxRates);
    expect(eurQuote.estimateAvailable).toBe(true);
    expect(eurQuote.destinationAmount).toBe("105.05");
  });

  it("converts USD limits per currency so INR amounts are checked against INR bounds", () => {
    const fxRates = { USD: 1, INR: 0.012, EUR: 1.1 };

    // Transak USD limits: $15 - $25,000 -> at 0.012 USD/INR: ₹1,250 - ₹2,083,333.33
    const inrLimits = getProviderLimitsForCurrency("transak", "INR", fxRates);
    expect(inrLimits).toEqual({ min: 1250, max: 2083333.33 });

    // ₹1,000 is below ₹1,250 minimum (was previously accepted as 1000 >= 15)
    expect(isWithinProviderLimits(1000, "transak", "INR", fxRates)).toBe(false);
    // ₹50,000 is within ₹1,250 - ₹2,083,333.33 (was previously rejected as 50000 > 25000)
    expect(isWithinProviderLimits(50000, "transak", "INR", fxRates)).toBe(true);

    // Comparison uses the same converted limits
    const quotes = compareOnrampQuotes(50000, "INR", { fxRates });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].withinLimits).toBe(true);
    expect(quotes[0].destinationAmount).toBe("570.00");
  });
});