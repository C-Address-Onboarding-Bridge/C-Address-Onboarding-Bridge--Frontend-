// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SESSION_STORAGE_KEY,
  SESSION_TTL_MS,
  clearSession,
  isSessionExpired,
  loadSession,
  markConnected,
  markDisconnected,
} from "@/lib/session";

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
const NOW = 1_700_000_000_000;

describe("wallet session persistence (#343)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts from a clean, connected-allowed session", () => {
    const session = loadSession(NOW);
    expect(session.manuallyDisconnected).toBe(false);
    expect(session.address).toBeNull();
  });

  it("persists an explicit disconnect so a reload still honours it", () => {
    markDisconnected(ADDRESS, NOW);
    // Simulates a fresh page load reading storage again.
    const session = loadSession(NOW + 1000);
    expect(session.manuallyDisconnected).toBe(true);
    expect(session.address).toBe(ADDRESS);
  });

  it("clears the sticky disconnect on an explicit connect", () => {
    markDisconnected(ADDRESS, NOW);
    markConnected(ADDRESS, NOW + 1000);
    expect(loadSession(NOW + 2000).manuallyDisconnected).toBe(false);
  });

  it("lapses a disconnect once the TTL has passed", () => {
    markDisconnected(ADDRESS, NOW);
    expect(loadSession(NOW + SESSION_TTL_MS - 1).manuallyDisconnected).toBe(true);
    expect(loadSession(NOW + SESSION_TTL_MS + 1).manuallyDisconnected).toBe(false);
  });

  it("drops the stored record once it has expired", () => {
    markDisconnected(ADDRESS, NOW);
    loadSession(NOW + SESSION_TTL_MS + 1);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("treats a future-stamped record as expired", () => {
    markDisconnected(ADDRESS, NOW + 60_000);
    expect(loadSession(NOW).manuallyDisconnected).toBe(false);
  });

  it("falls back to a clean session on corrupt or unexpected stored data", () => {
    for (const raw of ["not json", "null", "[]", '{"manuallyDisconnected":"yes"}']) {
      localStorage.setItem(SESSION_STORAGE_KEY, raw);
      expect(loadSession(NOW).manuallyDisconnected).toBe(false);
    }
  });

  it("loadSession defaults selectedWalletId to null on a fresh session", () => {
    expect(loadSession(NOW).selectedWalletId).toBeNull();
  });

  it("loadSession returns a fresh session when the stored record is a JSON array", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, "[1,2,3]");
    const session = loadSession(NOW);
    expect(session.manuallyDisconnected).toBe(false);
    expect(session.address).toBeNull();
    // The unparseable-as-a-session record must not be re-parsed on later calls.
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("loadSession is idempotent: reading twice does not itself expire a fresh record", () => {
    markDisconnected(ADDRESS, NOW);
    expect(loadSession(NOW + 1).manuallyDisconnected).toBe(true);
    expect(loadSession(NOW + 2).manuallyDisconnected).toBe(true);
  });

  it("clearSession removes the record", () => {
    markDisconnected(ADDRESS, NOW);
    clearSession();
    expect(loadSession(NOW).manuallyDisconnected).toBe(false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("clearSession is a no-op when nothing is stored", () => {
    expect(() => clearSession()).not.toThrow();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("clearSession swallows removeItem failures (privacy-mode storage)", () => {
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    try {
      expect(() => clearSession()).not.toThrow();
    } finally {
      removeItem.mockRestore();
    }
  });

  it("isSessionExpired brackets the TTL", () => {
    const session = { address: ADDRESS, manuallyDisconnected: true, updatedAt: NOW };
    expect(isSessionExpired(session, NOW)).toBe(false);
    expect(isSessionExpired(session, NOW + SESSION_TTL_MS)).toBe(false);
    expect(isSessionExpired(session, NOW + SESSION_TTL_MS + 1)).toBe(true);
    expect(isSessionExpired({ ...session, updatedAt: NaN }, NOW)).toBe(true);
  });

  it("isSessionExpired treats a future-stamped record as not expired in isolation", () => {
    // loadSession layers its own future-stamp rejection on top of this; in
    // isolation a negative age is simply "not yet past the TTL".
    const session = { address: ADDRESS, manuallyDisconnected: true, updatedAt: NOW + 60_000 };
    expect(isSessionExpired(session, NOW)).toBe(false);
  });

  it("isSessionExpired defaults `now` to the current time when omitted", () => {
    const recent = { address: ADDRESS, manuallyDisconnected: true, updatedAt: Date.now() };
    expect(isSessionExpired(recent)).toBe(false);
    const stale = { address: ADDRESS, manuallyDisconnected: true, updatedAt: Date.now() - SESSION_TTL_MS - 1 };
    expect(isSessionExpired(stale)).toBe(true);
  });

  it("markDisconnected returns the written session", () => {
    const result = markDisconnected(ADDRESS, NOW);
    expect(result.manuallyDisconnected).toBe(true);
    expect(result.address).toBe(ADDRESS);
    expect(result.updatedAt).toBe(NOW);
  });

  it("markConnected returns the written session", () => {
    const result = markConnected(ADDRESS, NOW);
    expect(result.manuallyDisconnected).toBe(false);
    expect(result.address).toBe(ADDRESS);
    expect(result.updatedAt).toBe(NOW);
  });

  it("markDisconnected with no address defaults to null", () => {
    const result = markDisconnected(undefined, NOW);
    expect(result.address).toBeNull();
    expect(result.manuallyDisconnected).toBe(true);
  });

  it("markConnected with null address clears the disconnect flag", () => {
    markDisconnected(ADDRESS, NOW);
    markConnected(null, NOW + 1000);
    const session = loadSession(NOW + 2000);
    expect(session.manuallyDisconnected).toBe(false);
    expect(session.address).toBeNull();
  });

  it("markConnected preserves a previously persisted selectedWalletId (#459)", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ address: null, manuallyDisconnected: true, updatedAt: NOW, selectedWalletId: "xbull" })
    );
    const result = markConnected(ADDRESS, NOW + 1000);
    expect(result.selectedWalletId).toBe("xbull");
    expect(loadSession(NOW + 2000).selectedWalletId).toBe("xbull");
  });

  it("markDisconnected preserves a previously persisted selectedWalletId (#459)", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ address: ADDRESS, manuallyDisconnected: false, updatedAt: NOW, selectedWalletId: "lobstr" })
    );
    const result = markDisconnected(ADDRESS, NOW + 1000);
    expect(result.selectedWalletId).toBe("lobstr");
    expect(loadSession(NOW + 2000).selectedWalletId).toBe("lobstr");
  });
});
