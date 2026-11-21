// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

describe("useCopyToClipboard (#1108)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initializes with idle status", () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.status).toBe("idle");
  });

  it("successfully copies when navigator.clipboard.writeText is available and auto-resets", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { result } = renderHook(() => useCopyToClipboard(2000));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy("test text");
    });

    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("test text");
    expect(result.current.status).toBe("copied");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe("idle");
  });

  it("handles clipboard rejection by setting error and auto-resetting to idle", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { result } = renderHook(() => useCopyToClipboard(1500));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy("failed text");
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe("error");

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.status).toBe("idle");
  });

  it("auto-resets to idle after error when navigator.clipboard is unavailable", async () => {
    // Remove clipboard API
    // @ts-expect-error remove property for testing
    delete navigator.clipboard;
    // mock execCommand to fail so it tests pure missing-API failure path
    document.execCommand = vi.fn().mockReturnValue(false);

    const { result } = renderHook(() => useCopyToClipboard(2000));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy("no api text");
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe("error");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe("idle");
  });

  it("clears timeout on unmount and prevents state update on unmounted component", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { result, unmount } = renderHook(() => useCopyToClipboard(2000));

    await act(async () => {
      await result.current.copy("text to unmount");
    });

    expect(result.current.status).toBe("copied");

    // Unmount before timer fires
    unmount();

    // Advancing timers should not throw warning or error
    act(() => {
      vi.advanceTimersByTime(2000);
    });
  });

  it("supports manual reset() call", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { result } = renderHook(() => useCopyToClipboard(5000));

    await act(async () => {
      await result.current.copy("sample");
    });

    expect(result.current.status).toBe("copied");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
  });
});
