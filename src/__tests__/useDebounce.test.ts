import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "@/hooks/useDebounce";

describe("useDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 200));
    expect(result.current).toBe("initial");
  });

  it("does not update before the delay has elapsed", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: "first" },
    });

    rerender({ value: "second" });
    act(() => { vi.advanceTimersByTime(100); });

    expect(result.current).toBe("first");
  });

  it("updates after the delay has elapsed", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: "first" },
    });

    rerender({ value: "second" });
    act(() => { vi.advanceTimersByTime(200); });

    expect(result.current).toBe("second");
  });

  it("only fires once for rapid consecutive changes — resets the timer each time", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: "a" },
    });

    rerender({ value: "b" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: "c" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: "d" });

    // Still at original — 200 ms never elapsed since last change
    expect(result.current).toBe("a");

    act(() => { vi.advanceTimersByTime(200); });
    // Fires with the last value only
    expect(result.current).toBe("d");
  });

  it("respects a custom delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: "x" },
    });

    rerender({ value: "y" });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe("x");

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("y");
  });
});
