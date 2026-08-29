// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { shouldWarnOnMainnetAction } from "@/lib/stellar";

describe("shouldWarnOnMainnetAction (#480)", () => {
  it("warns on a mainnet action initiated shortly after a network change", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", true, false)).toBe(true);
  });

  it("does not warn on testnet even after a recent change", () => {
    expect(shouldWarnOnMainnetAction("TESTNET", true, false)).toBe(false);
  });

  it("does not warn when no network change happened recently", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", false, false)).toBe(false);
  });

  it("does not warn once the user has acknowledged the switch", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", true, true)).toBe(false);
  });
});
