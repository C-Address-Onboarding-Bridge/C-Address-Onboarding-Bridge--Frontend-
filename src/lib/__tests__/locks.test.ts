import { describe, it, expect } from "vitest";
import {
  countdownTo,
  formatCountdown,
  isLockClaimable,
  isLockMatured,
  sortLocksByUnlockTime,
  validateUnlockTime,
  type Lock,
} from "../locks";

const baseLock = (overrides: Partial<Lock> = {}): Lock => ({
  id: "1",
  sender: "GSENDER",
  recipient: "GRECIPIENT",
  amount: "10",
  asset: "XLM",
  unlockTime: 1_700_000_000_000,
  status: "pending",
  createdAt: 1_699_000_000_000,
  network: "TESTNET",
  ...overrides,
});

describe("isLockMatured", () => {
  it("is false before the unlock time", () => {
    expect(isLockMatured(baseLock({ unlockTime: 1000 }), 500)).toBe(false);
  });

  it("is true at exactly the unlock time", () => {
    expect(isLockMatured(baseLock({ unlockTime: 1000 }), 1000)).toBe(true);
  });

  it("is true after the unlock time", () => {
    expect(isLockMatured(baseLock({ unlockTime: 1000 }), 1500)).toBe(true);
  });
});

describe("isLockClaimable", () => {
  it("is true for a matured, pending lock", () => {
    expect(isLockClaimable(baseLock({ unlockTime: 1000, status: "pending" }), 2000)).toBe(true);
  });

  it("is false for an unmatured, pending lock", () => {
    expect(isLockClaimable(baseLock({ unlockTime: 2000, status: "pending" }), 1000)).toBe(false);
  });

  it("is false for a matured but already-claimed lock", () => {
    expect(isLockClaimable(baseLock({ unlockTime: 1000, status: "claimed" }), 2000)).toBe(false);
  });

  it("is false for an unmatured, already-claimed lock (defensive — shouldn't occur)", () => {
    expect(isLockClaimable(baseLock({ unlockTime: 2000, status: "claimed" }), 1000)).toBe(false);
  });
});

describe("countdownTo", () => {
  it("breaks down a multi-day remainder", () => {
    const twoDays = 2 * 86400 * 1000 + 3 * 3600 * 1000 + 4 * 60 * 1000 + 5000;
    const parts = countdownTo(twoDays, 0);
    expect(parts).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, totalMs: twoDays });
  });

  it("floors negative remainders at zero instead of going negative", () => {
    const parts = countdownTo(1000, 5000);
    expect(parts.totalMs).toBe(0);
    expect(parts).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("is exactly zero at the target instant", () => {
    expect(countdownTo(1000, 1000).totalMs).toBe(0);
  });
});

describe("formatCountdown", () => {
  it('renders "Ready to claim" once time is up', () => {
    expect(formatCountdown(countdownTo(1000, 1000))).toBe("Ready to claim");
    expect(formatCountdown(countdownTo(1000, 2000))).toBe("Ready to claim");
  });

  it("renders days and hours when a day or more remains", () => {
    const target = 2 * 86400 * 1000 + 5 * 3600 * 1000;
    expect(formatCountdown(countdownTo(target, 0))).toBe("2d 5h");
  });

  it("renders hours and minutes under a day", () => {
    const target = 5 * 3600 * 1000 + 30 * 60 * 1000;
    expect(formatCountdown(countdownTo(target, 0))).toBe("5h 30m");
  });

  it("renders minutes and seconds under an hour", () => {
    const target = 12 * 60 * 1000 + 34 * 1000;
    expect(formatCountdown(countdownTo(target, 0))).toBe("12m 34s");
  });

  it("renders seconds only under a minute", () => {
    expect(formatCountdown(countdownTo(45 * 1000, 0))).toBe("45s");
  });
});

describe("validateUnlockTime", () => {
  it("rejects an empty value", () => {
    const result = validateUnlockTime("");
    expect(result.ok).toBe(false);
  });

  it("rejects an unparseable value", () => {
    const result = validateUnlockTime("not-a-date");
    expect(result.ok).toBe(false);
  });

  it("rejects a time in the past", () => {
    const result = validateUnlockTime("2020-01-01T00:00", Date.parse("2025-01-01T00:00"));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("future");
  });

  it("rejects a time exactly at now", () => {
    const now = Date.parse("2025-01-01T00:00:00.000Z");
    const result = validateUnlockTime("2025-01-01T00:00:00.000Z", now);
    expect(result.ok).toBe(false);
  });

  it("accepts a future date/time and returns its epoch ms", () => {
    const now = Date.parse("2025-01-01T00:00:00.000Z");
    const future = "2025-06-01T00:00:00.000Z";
    const result = validateUnlockTime(future, now);
    expect(result).toEqual({ ok: true, unlockTime: Date.parse(future) });
  });
});

describe("sortLocksByUnlockTime", () => {
  it("sorts soonest-unlocking first without mutating the input", () => {
    const locks = [baseLock({ id: "b", unlockTime: 2000 }), baseLock({ id: "a", unlockTime: 1000 })];
    const sorted = sortLocksByUnlockTime(locks);

    expect(sorted.map((l) => l.id)).toEqual(["a", "b"]);
    expect(locks.map((l) => l.id)).toEqual(["b", "a"]);
  });
});
