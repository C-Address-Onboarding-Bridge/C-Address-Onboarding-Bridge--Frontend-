import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

describe("useDelayedLoading", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts false even when active is true from the first render", () => {
    const { result } = renderHook(() => useDelayedLoading(true, 200));
    expect(result.current).toBe(false);
  });

  it("stays false while active but before the delay elapses", () => {
    const { result } = renderHook(() => useDelayedLoading(true, 200));
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current).toBe(false);
  });

  it("flips true once active has held for the full delay", () => {
    const { result } = renderHook(() => useDelayedLoading(true, 200));
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(true);
  });

  it("never flips true if active goes false before the delay elapses (no flash on fast loads)", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedLoading(active, 200), {
      initialProps: { active: true },
    });

    act(() => { vi.advanceTimersByTime(100); });
    rerender({ active: false });
    act(() => { vi.advanceTimersByTime(200); });

    expect(result.current).toBe(false);
  });

  it("resets back to false as soon as active goes false, even after showing", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedLoading(active, 200), {
      initialProps: { active: true },
    });

    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it("respects a custom delay", () => {
    const { result } = renderHook(() => useDelayedLoading(true, 500));

    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe(true);
  });
});
