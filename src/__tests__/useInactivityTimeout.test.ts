import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { INACTIVITY_STORAGE_KEY, REAUTH_REQUIRED_KEY } from "@/lib/inactivityTimeout";

/**
 * useInactivityTimeout drives the inactivity warning and the re-auth
 * requirement (#754). A 2-minute timeout keeps the numbers readable: the
 * warning fires one minute before the timeout, at 60s, and the timeout at 120s.
 */
const TIMEOUT_MS = 120_000;
const WARNING_AT = TIMEOUT_MS - 60_000;

function setup() {
  const onWarning = vi.fn();
  const onTimeout = vi.fn();
  const hook = renderHook(() => useInactivityTimeout({ timeoutMs: TIMEOUT_MS, onWarning, onTimeout }));
  return { ...hook, onWarning, onTimeout };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useInactivityTimeout", () => {
  it("records activity on mount and starts with no warning", () => {
    const { result } = setup();
    expect(localStorage.getItem(INACTIVITY_STORAGE_KEY)).toBe(String(Date.now()));
    expect(result.current.inactivityState?.isWarning ?? false).toBe(false);
    expect(result.current.inactivityState?.isTimedOut ?? false).toBe(false);
  });

  it("does not warn before one minute ahead of the timeout", () => {
    const { result, onWarning } = setup();
    advance(WARNING_AT - 1);
    expect(onWarning).not.toHaveBeenCalled();
    expect(result.current.inactivityState?.isWarning ?? false).toBe(false);
  });

  it("warns one minute before the timeout", () => {
    const { result, onWarning, onTimeout } = setup();
    advance(WARNING_AT);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.inactivityState?.isWarning).toBe(true);
    expect(result.current.inactivityState?.isTimedOut).toBe(false);
  });

  it("times out after the full duration, requires re-auth and clears sensitive state", () => {
    sessionStorage.setItem("draft", "secret");
    const { result, onTimeout } = setup();
    advance(TIMEOUT_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.inactivityState).toMatchObject({ isTimedOut: true, reauthRequired: true });
    expect(localStorage.getItem(REAUTH_REQUIRED_KEY)).not.toBeNull();
    expect(sessionStorage.getItem("draft")).toBeNull();
  });

  it("activity before the warning does not change anything", () => {
    const { result, onWarning } = setup();
    advance(WARNING_AT / 2);
    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    expect(result.current.inactivityState?.isWarning ?? false).toBe(false);
    advance(WARNING_AT / 2);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it.each(["mousemove", "keydown", "click", "scroll"])(
    "%s during the warning extends the session",
    (type) => {
      const { result, onTimeout } = setup();
      advance(WARNING_AT);
      expect(result.current.inactivityState?.isWarning).toBe(true);

      act(() => {
        window.dispatchEvent(new Event(type));
      });
      expect(result.current.inactivityState?.isWarning).toBe(false);

      // The original deadline passes without a timeout...
      advance(TIMEOUT_MS - WARNING_AT);
      expect(onTimeout).not.toHaveBeenCalled();
      // ...because the timers restarted from the moment of activity.
      advance(WARNING_AT);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    },
  );

  it("extend() clears the warning and the re-auth flag and restarts the timers", () => {
    const { result, onTimeout } = setup();
    advance(WARNING_AT);

    act(() => result.current.extend());
    expect(result.current.inactivityState).toMatchObject({ isWarning: false, reauthRequired: false });
    expect(localStorage.getItem(INACTIVITY_STORAGE_KEY)).toBe(String(Date.now()));

    advance(TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    advance(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("extend() before any state exists starts a fresh, active state", () => {
    const { result } = setup();
    act(() => result.current.clearTimeout());
    expect(result.current.inactivityState).toBeNull();

    act(() => result.current.extend());
    expect(result.current.inactivityState).toEqual({
      lastActivityAt: Date.now(),
      isTimedOut: false,
      isWarning: false,
      reauthRequired: false,
    });
  });

  it("clearTimeout() stops both timers and wipes the stored state", () => {
    const { result, onWarning, onTimeout } = setup();
    localStorage.setItem(REAUTH_REQUIRED_KEY, "1");

    act(() => result.current.clearTimeout());
    expect(result.current.inactivityState).toBeNull();
    expect(localStorage.getItem(INACTIVITY_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(REAUTH_REQUIRED_KEY)).toBeNull();

    advance(TIMEOUT_MS * 2);
    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("stops listening and timing on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount, onWarning, onTimeout } = setup();
    unmount();

    for (const type of ["mousemove", "keydown", "click", "scroll"]) {
      expect(remove).toHaveBeenCalledWith(type, expect.any(Function));
    }
    advance(TIMEOUT_MS * 2);
    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
    remove.mockRestore();
  });

  it("uses the 15-minute default when no timeout is given", () => {
    const onWarning = vi.fn();
    renderHook(() => useInactivityTimeout({ onWarning }));
    advance(14 * 60_000 - 1);
    expect(onWarning).not.toHaveBeenCalled();
    advance(1);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });
});
