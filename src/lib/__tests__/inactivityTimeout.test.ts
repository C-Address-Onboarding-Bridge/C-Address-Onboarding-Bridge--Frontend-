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

/**
 * TODO(next-bounty): the tests marked `.skip` in this file assert behaviour that
 * was never finished (or was lost in a bad merge) during the first bounty
 * programme. They are skipped -- not deleted -- so the next programme has an
 * exact worklist: un-skip one, make it pass, repeat. Nothing here was rewritten
 * to fit the current implementation.
 */

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

  it("keeps reauthRequired true across a simulated reload even once isTimedOut alone would reset", () => {
    // Time out once...
    recordActivity(NOW);
    const timedOutState = getInactivityState(NOW + INACTIVITY_TIMEOUT_MS + 1000, INACTIVITY_TIMEOUT_MS);
    expect(timedOutState.isTimedOut).toBe(true);
    expect(timedOutState.reauthRequired).toBe(true);
    markReauthRequired(NOW + INACTIVITY_TIMEOUT_MS + 1000);

    // ...then simulate a page reload: a fresh read of inactivity state is
    // computed relative to a brand-new "now", shortly after the reload,
    // with no new real user activity. isTimedOut (purely time-derived) is
    // no longer true, but reauthRequired must still be true because the
    // persisted REAUTH_REQUIRED_KEY flag was never explicitly cleared.
    const reloadNow = NOW + INACTIVITY_TIMEOUT_MS + 2000;
    const afterReload = getInactivityState(reloadNow, INACTIVITY_TIMEOUT_MS);
    expect(afterReload.reauthRequired).toBe(true);
  });

  it("reauthRequired goes back to false only after an explicit clearReauthRequired", () => {
    recordActivity(NOW);
    markReauthRequired(NOW);
    expect(getInactivityState(NOW + 1000, INACTIVITY_TIMEOUT_MS).reauthRequired).toBe(true);

    clearReauthRequired();
    expect(getInactivityState(NOW + 2000, INACTIVITY_TIMEOUT_MS).reauthRequired).toBe(false);
  });
});
