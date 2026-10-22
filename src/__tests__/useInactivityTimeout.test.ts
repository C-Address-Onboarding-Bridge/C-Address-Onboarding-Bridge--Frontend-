import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { INACTIVITY_TIMEOUT_MS } from "@/lib/inactivityTimeout";

describe("useInactivityTimeout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never fires the warning while the user keeps clicking (#937)", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    renderHook(() => useInactivityTimeout({ onWarning, onTimeout }));

    // Click once every 5 minutes for much longer than the 15 minute
    // timeout. Because handleActivity now records real activity and
    // reschedules the timers (not just resets an already-visible warning),
    // neither callback should ever fire.
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
        window.dispatchEvent(new Event("click"));
      });
    }

    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("still fires the warning and timeout when truly idle", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    renderHook(() => useInactivityTimeout({ onWarning, onTimeout }));

    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - 60_000 + 1);
    });
    expect(onWarning).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not reset the timeout schedule when the caller passes new inline callbacks every render", () => {
    const onTimeout = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useInactivityTimeout({ onWarning: () => {}, onTimeout: cb }),
      { initialProps: { cb: onTimeout } }
    );

    // Re-render several times with brand-new inline function identities,
    // like a parent component that doesn't memoize its callbacks would.
    for (let i = 0; i < 5; i++) {
      rerender({ cb: () => onTimeout() });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // The mount-time schedule should still be the one in effect: advancing
    // past the full timeout now fires exactly once.
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
