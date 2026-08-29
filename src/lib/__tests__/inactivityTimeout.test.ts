import { describe, it, expect, beforeEach } from "vitest";
import {
  INACTIVITY_TIMEOUT_MS,
  INACTIVITY_STORAGE_KEY,
  REAUTH_REQUIRED_KEY,
  recordActivity,
  getLastActivityTime,
  getInactivityState,
  extendSession,
  clearInactivityState,
  markReauthRequired,
  isReauthRequired,
  clearReauthRequired,
} from "@/lib/inactivityTimeout";

const NOW = 1_700_000_000_000;

describe("inactivity timeout management", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records activity timestamp", () => {
    recordActivity(NOW);
    expect(getLastActivityTime(NOW)).toBe(NOW);
  });

  it("returns current time when no activity recorded", () => {
    const result = getLastActivityTime(NOW);
    expect(result).toBe(NOW);
  });

  it("detects active state within timeout window", () => {
    recordActivity(NOW);
    const state = getInactivityState(NOW + 1000, INACTIVITY_TIMEOUT_MS);
    expect(state.isTimedOut).toBe(false);
    expect(state.isWarning).toBe(false);
    expect(state.reauthRequired).toBe(false);
  });

  it("detects warning state before timeout", () => {
    recordActivity(NOW);
    const warningTime = NOW + INACTIVITY_TIMEOUT_MS - 30_000; // 30 seconds before timeout
    const state = getInactivityState(warningTime, INACTIVITY_TIMEOUT_MS);
    expect(state.isWarning).toBe(true);
  });

  it("detects timeout state after inactivity period", () => {
    recordActivity(NOW);
    const state = getInactivityState(NOW + INACTIVITY_TIMEOUT_MS + 1000, INACTIVITY_TIMEOUT_MS);
    expect(state.isTimedOut).toBe(true);
    expect(state.reauthRequired).toBe(true);
  });

  it("extends session by updating activity time", () => {
    recordActivity(NOW);
    extendSession(NOW + 1000);
    expect(getLastActivityTime(NOW + 2000)).toBe(NOW + 1000);
  });

  it("clears all inactivity state", () => {
    recordActivity(NOW);
    markReauthRequired();
    clearInactivityState();
    expect(localStorage.getItem(INACTIVITY_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(REAUTH_REQUIRED_KEY)).toBeNull();
  });

  it("marks reauth as required", () => {
    markReauthRequired(NOW);
    expect(isReauthRequired()).toBe(true);
  });

  it("clears reauth requirement", () => {
    markReauthRequired(NOW);
    clearReauthRequired();
    expect(isReauthRequired()).toBe(false);
  });

  it("detects reauth required after timeout", () => {
    recordActivity(NOW);
    const state = getInactivityState(NOW + INACTIVITY_TIMEOUT_MS + 1000);
    expect(state.reauthRequired).toBe(true);
  });

  it("handles custom timeout duration", () => {
    const customTimeout = 5 * 60 * 1000; // 5 minutes
    recordActivity(NOW);
    const state = getInactivityState(NOW + customTimeout + 1000, customTimeout);
    expect(state.isTimedOut).toBe(true);
  });

  it("handles invalid stored activity time", () => {
    localStorage.setItem(INACTIVITY_STORAGE_KEY, "invalid");
    const result = getLastActivityTime(NOW);
    expect(result).toBe(NOW);
  });

  it("handles missing activity when checking reauth", () => {
    expect(isReauthRequired()).toBe(false);
  });
});
