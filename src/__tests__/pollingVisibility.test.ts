// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  getHealthStatus: vi.fn(),
}));

import { getHealthStatus } from "@/lib/api";
import { useHealthStatus } from "@/hooks/useHealthStatus";

describe("useHealthStatus tab visibility pausing (#712)", () => {
  const originalVisibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
  let hidden = false;

  const setHidden = (value: boolean) => {
    hidden = value;
  };

  beforeEach(() => {
    hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    vi.useFakeTimers();
    vi.mocked(getHealthStatus).mockReset();
    vi.mocked(getHealthStatus).mockResolvedValue({ status: "healthy" } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (document as unknown as Record<string, unknown>).hidden;
    delete (document as unknown as Record<string, unknown>).visibilityState;
    if (originalHidden) Object.defineProperty(Document.prototype, "hidden", originalHidden);
    if (originalVisibility) Object.defineProperty(Document.prototype, "visibilityState", originalVisibility);
  });

  it("does not fetch while hidden and fetches once on becoming visible", async () => {
    renderHook(() => useHealthStatus({ pollInterval: 1000, initialDelay: 100 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(getHealthStatus).toHaveBeenCalledTimes(1);

    setHidden(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(getHealthStatus).toHaveBeenCalledTimes(1);

    setHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(getHealthStatus).toHaveBeenCalledTimes(2);
  });
});
