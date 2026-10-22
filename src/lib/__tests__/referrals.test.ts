import { describe, it, expect, beforeEach } from "vitest";
import {
  captureReferralFromUrl,
  getStoredReferralCode,
  storeReferralCode,
  clearStoredReferralCode,
  isValidReferralCode,
  REFERRAL_CODE_TTL_MS,
} from "@/lib/referrals";

const NOW = 1_700_000_000_000;

describe("referral capture (#936)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("validates referral code shape", () => {
    expect(isValidReferralCode("abc123")).toBe(true);
    expect(isValidReferralCode("abc_123-XY")).toBe(true);
    expect(isValidReferralCode("")).toBe(false);
    expect(isValidReferralCode("ab")).toBe(false); // too short
    expect(isValidReferralCode("has spaces")).toBe(false);
    expect(isValidReferralCode("<script>")).toBe(false);
    expect(isValidReferralCode(42)).toBe(false);
  });

  it("captures a valid ref param and strips it from the URL", () => {
    const stripped = captureReferralFromUrl("https://app.example/bridge?ref=abc123&amount=5", "mainnet", NOW);
    expect(stripped).toBe("/bridge?amount=5");
    expect(getStoredReferralCode("mainnet", NOW)).toBe("abc123");
  });

  it("captures from the root path with only the ref param", () => {
    const stripped = captureReferralFromUrl("https://app.example/?ref=xyz789", "mainnet", NOW);
    expect(stripped).toBe("/");
    expect(getStoredReferralCode("mainnet", NOW)).toBe("xyz789");
  });

  it("ignores an invalid ref param and does not store or strip anything", () => {
    const stripped = captureReferralFromUrl("https://app.example/?ref=%3Cbad%3E", "mainnet", NOW);
    expect(stripped).toBeNull();
    expect(getStoredReferralCode("mainnet", NOW)).toBeNull();
  });

  it("returns null when there is no ref param", () => {
    const stripped = captureReferralFromUrl("https://app.example/bridge?amount=5", "mainnet", NOW);
    expect(stripped).toBeNull();
  });

  it("scopes captured codes by network", () => {
    storeReferralCode("mainnetCode", "mainnet", NOW);
    storeReferralCode("testnetCode", "testnet", NOW);
    expect(getStoredReferralCode("mainnet", NOW)).toBe("mainnetCode");
    expect(getStoredReferralCode("testnet", NOW)).toBe("testnetCode");
  });

  it("expires a captured code after the TTL", () => {
    storeReferralCode("abc123", "mainnet", NOW);
    expect(getStoredReferralCode("mainnet", NOW + REFERRAL_CODE_TTL_MS - 1)).toBe("abc123");
    expect(getStoredReferralCode("mainnet", NOW + REFERRAL_CODE_TTL_MS + 1)).toBeNull();
  });

  it("clears a stored code on demand", () => {
    storeReferralCode("abc123", "mainnet", NOW);
    clearStoredReferralCode("mainnet");
    expect(getStoredReferralCode("mainnet", NOW)).toBeNull();
  });

  it("drops a corrupted stored entry instead of throwing", () => {
    localStorage.setItem("referral:capturedCode:mainnet", "not json");
    expect(getStoredReferralCode("mainnet", NOW)).toBeNull();
  });
});
