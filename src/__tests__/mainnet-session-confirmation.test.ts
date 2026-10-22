// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAINNET_CONFIRMATION_MESSAGES,
  MAINNET_SESSION_CONFIRMATION_KEY,
  getMainnetConfirmationReason,
  hasConfirmedMainnetThisSession,
  recordMainnetSessionConfirmation,
} from "@/lib/mainnetConfirmation";

describe("getMainnetConfirmationReason (#759)", () => {
  it("asks on the first mainnet transaction even without a network switch", () => {
    // The #480 warning alone returned false here, so funds moved unconfirmed.
    expect(getMainnetConfirmationReason("PUBLIC", false, false, false)).toBe("session");
  });

  it("does not ask again once confirmed this session", () => {
    expect(getMainnetConfirmationReason("PUBLIC", false, false, true)).toBeNull();
  });

  it("still warns after a recent network switch, even if confirmed this session", () => {
    expect(getMainnetConfirmationReason("PUBLIC", true, false, true)).toBe("network_switch");
    expect(getMainnetConfirmationReason("PUBLIC", true, false, false)).toBe("network_switch");
  });

  it("does not repeat the switch warning once acknowledged", () => {
    expect(getMainnetConfirmationReason("PUBLIC", true, true, true)).toBeNull();
    expect(getMainnetConfirmationReason("PUBLIC", true, true, false)).toBe("session");
  });

  it("never asks off mainnet", () => {
    for (const recent of [true, false]) {
      for (const confirmed of [true, false]) {
        expect(getMainnetConfirmationReason("TESTNET", recent, false, confirmed)).toBeNull();
      }
    }
  });

  it("has copy for every reason that mentions mainnet", () => {
    for (const reason of ["session", "network_switch"] as const) {
      expect(MAINNET_CONFIRMATION_MESSAGES[reason].title).toMatch(/mainnet/i);
      expect(MAINNET_CONFIRMATION_MESSAGES[reason].body).toMatch(/real funds/i);
    }
  });
});

describe("mainnet session confirmation storage (#759)", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("starts unconfirmed and stays confirmed for the session once recorded", () => {
    expect(hasConfirmedMainnetThisSession()).toBe(false);
    recordMainnetSessionConfirmation();
    expect(hasConfirmedMainnetThisSession()).toBe(true);
    expect(window.sessionStorage.getItem(MAINNET_SESSION_CONFIRMATION_KEY)).toBe("1");
  });

  it("uses sessionStorage, not localStorage, so a new session asks again", () => {
    recordMainnetSessionConfirmation();
    expect(window.localStorage.getItem(MAINNET_SESSION_CONFIRMATION_KEY)).toBeNull();
    window.sessionStorage.clear();
    expect(hasConfirmedMainnetThisSession()).toBe(false);
  });

  it("ignores unexpected stored values", () => {
    window.sessionStorage.setItem(MAINNET_SESSION_CONFIRMATION_KEY, "true");
    expect(hasConfirmedMainnetThisSession()).toBe(false);
  });

  it("treats unreadable storage as unconfirmed and never throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => recordMainnetSessionConfirmation()).not.toThrow();
    expect(hasConfirmedMainnetThisSession()).toBe(false);
  });
});
