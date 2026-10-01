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

describe("shouldWarnOnMainnetAction — one-per-session mainnet confirmation (#759)", () => {
  it("warns on the first mainnet action of a session even without a recent network switch", () => {
    // User opened app already on mainnet (recentlyChangedNetwork = false), session not yet confirmed
    expect(shouldWarnOnMainnetAction("PUBLIC", false, false, false)).toBe(true);
  });

  it("does not warn on subsequent mainnet actions once the session is confirmed", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", false, false, true)).toBe(false);
  });

  it("still warns if the network changed recently even if the session was previously confirmed", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", true, false, true)).toBe(true);
  });

  it("does not warn on testnet even if the session is not confirmed", () => {
    expect(shouldWarnOnMainnetAction("TESTNET", false, false, false)).toBe(false);
  });

  it("does not warn if the user already acknowledged the prompt", () => {
    expect(shouldWarnOnMainnetAction("PUBLIC", false, true, false)).toBe(false);
  });
});

