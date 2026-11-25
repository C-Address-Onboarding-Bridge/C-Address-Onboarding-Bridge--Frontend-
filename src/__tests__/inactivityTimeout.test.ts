// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { clearSensitiveState } from "@/lib/inactivityTimeout";
import { IN_FLIGHT_TRANSACTION_KEY } from "@/components/error-boundary";

const BRIDGE_FORM_STORAGE_KEY = "bridge:form-state:v1";

describe("clearSensitiveState (src/lib/inactivityTimeout.ts)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("does not remove IN_FLIGHT_TRANSACTION_KEY, so a submitted-but-unconfirmed bridge transaction survives an inactivity timeout (#939)", () => {
    sessionStorage.setItem(
      IN_FLIGHT_TRANSACTION_KEY,
      JSON.stringify({ hash: "abc123", network: "TESTNET", from: "G...", to: "C...", amount: "10", asset: "XLM" })
    );

    clearSensitiveState();

    expect(sessionStorage.getItem(IN_FLIGHT_TRANSACTION_KEY)).not.toBeNull();
  });

  it("removes the bridge form draft, since that is intentionally sensitive/stale state", () => {
    sessionStorage.setItem(
      BRIDGE_FORM_STORAGE_KEY,
      JSON.stringify({ toAddress: "C...", amount: "5", asset: "XLM", step: "form" })
    );

    clearSensitiveState();

    expect(sessionStorage.getItem(BRIDGE_FORM_STORAGE_KEY)).toBeNull();
  });

  it("does not throw when sessionStorage access fails", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    expect(() => clearSensitiveState()).not.toThrow();

    if (original) {
      Object.defineProperty(window, "sessionStorage", original);
    }
  });
});
