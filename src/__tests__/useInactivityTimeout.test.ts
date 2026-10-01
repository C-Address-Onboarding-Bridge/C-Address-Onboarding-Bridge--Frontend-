import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import {
  INACTIVITY_STORAGE_KEY,
  REAUTH_REQUIRED_KEY,
  isReauthRequired,
} from "@/lib/inactivityTimeout";

describe("useInactivityTimeout", () => {
  const TEST_TIMEOUT_MS = 120_000; // 2 minutes (warning at 1 minute)

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("returns initial state and records activity in localStorage on mount", () => {
    const { result } = renderHook(() =>
      useInactivityTimeout({ timeoutMs: TEST_TIMEOUT_MS })
    );

    expect(result.current.inactivityState).not.toBeNull();
    expect(result.current.inactivityState?.isTimedOut).toBe(false);
    expect(result.current.inactivityState?.isWarning).toBe(false);
    expect(result.current.inactivityState?.reauthRequired).toBe(false);

    const stored = localStorage.getItem(INACTIVITY_STORAGE_KEY);
    expect(stored).not.toBeNull();
  });

  it("triggers warning callback and updates isWarning at timeoutMs - 60s", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: TEST_TIMEOUT_MS,
        onWarning,
        onTimeout,
      })
    );

    // Advance to warning threshold (120s - 60s = 60s)
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.inactivityState?.isWarning).toBe(true);
    expect(result.current.inactivityState?.isTimedOut).toBe(false);
  });

  it("triggers timeout callback and marks reauthRequired at full timeoutMs", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: TEST_TIMEOUT_MS,
        onWarning,
        onTimeout,
      })
    );

    // Advance through warning to full timeout
    act(() => {
      vi.advanceTimersByTime(TEST_TIMEOUT_MS);
    });

    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.inactivityState?.isTimedOut).toBe(true);
    expect(result.current.inactivityState?.reauthRequired).toBe(true);
    expect(isReauthRequired()).toBe(true);
  });

  it("automatically extends session when user activity occurs during warning", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: TEST_TIMEOUT_MS,
        onWarning,
        onTimeout,
      })
    );

    // Advance to warning
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.inactivityState?.isWarning).toBe(true);

    // User moves mouse
    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });

    // Warning is cleared
    expect(result.current.inactivityState?.isWarning).toBe(false);

    // Timeout is delayed: advancing 60s does NOT trigger timeout
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("responds to keyboard, click, and scroll user activity during warning", () => {
    for (const eventName of ["keydown", "click", "scroll"]) {
      localStorage.clear();
      const { result, unmount } = renderHook(() =>
        useInactivityTimeout({ timeoutMs: TEST_TIMEOUT_MS })
      );

      // Trigger warning
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(result.current.inactivityState?.isWarning).toBe(true);

      // Trigger event
      act(() => {
        window.dispatchEvent(new Event(eventName));
      });
      expect(result.current.inactivityState?.isWarning).toBe(false);

      unmount();
    }
  });

  it("manually extends session via extend() method", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: TEST_TIMEOUT_MS,
        onWarning,
        onTimeout,
      })
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.inactivityState?.isWarning).toBe(true);

    act(() => {
      result.current.extend();
    });

    expect(result.current.inactivityState?.isWarning).toBe(false);
    expect(result.current.inactivityState?.reauthRequired).toBe(false);
  });

  it("manually clears timeouts and state via clearTimeout() method", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: TEST_TIMEOUT_MS,
        onWarning,
        onTimeout,
      })
    );

    act(() => {
      result.current.clearTimeout();
    });

    expect(result.current.inactivityState).toBeNull();
    expect(localStorage.getItem(INACTIVITY_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(REAUTH_REQUIRED_KEY)).toBeNull();

    // Advance past timeout: callbacks should never fire
    act(() => {
      vi.advanceTimersByTime(TEST_TIMEOUT_MS * 2);
    });
    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("cleans up event listeners and timers on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const onWarning = vi.fn();
    const onTimeout = vi.fn();

    const { unmount } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: TEST_TIMEOUT_MS,
        onWarning,
        onTimeout,
      })
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function));

    // Timers cancelled on unmount
    act(() => {
      vi.advanceTimersByTime(TEST_TIMEOUT_MS * 2);
    });
    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
