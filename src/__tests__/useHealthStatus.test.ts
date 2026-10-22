import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HealthStatus } from "@/lib/api";

const getHealthStatus = vi.fn<() => Promise<HealthStatus>>();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getHealthStatus: () => getHealthStatus() };
});

import { useHealthStatus } from "../hooks/useHealthStatus";

const HEALTHY: HealthStatus = {
  status: "healthy",
  timestamp: "2026-01-01T00:00:00.000Z",
  services: { horizon: "up" },
  circuitBreakers: {},
};

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

/** Advance fake timers and let the resulting health check's promises settle. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useHealthStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getHealthStatus.mockReset();
    getHealthStatus.mockResolvedValue(HEALTHY);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the initial delay, then polls on the interval while visible", async () => {
    renderHook(() => useHealthStatus({ initialDelay: 2000, pollInterval: 30_000 }));
    expect(getHealthStatus).not.toHaveBeenCalled();

    await advance(2000);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);

    await advance(30_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(2);
  });

  it("pauses polling while the tab is hidden (#712)", async () => {
    renderHook(() => useHealthStatus({ initialDelay: 0 }));
    await advance(0);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(90_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
  });

  it("refreshes immediately when the tab becomes visible again (#712)", async () => {
    renderHook(() => useHealthStatus({ initialDelay: 0 }));
    await advance(0);

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(getHealthStatus).toHaveBeenCalledTimes(2);
  });

  it("flags a degraded status", async () => {
    getHealthStatus.mockResolvedValue({ ...HEALTHY, status: "degraded", services: { horizon: "degraded" } });
    const { result } = renderHook(() => useHealthStatus({ initialDelay: 0 }));
    await advance(0);
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.health?.status).toBe("degraded");
  });

  it("falls back to a full-shape unhealthy status when the check keeps throwing (#842)", async () => {
    getHealthStatus.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useHealthStatus({ initialDelay: 0 }));
    await advance(0);

    expect(result.current.isDegraded).toBe(true);
    expect(result.current.health?.status).toBe("unhealthy");
    // The old sentinel was `{ status, message }`, so these read `undefined`.
    expect(result.current.health?.services.horizon).toBe("down");
    expect(result.current.health?.circuitBreakers).toEqual({});
    expect(result.current.health).not.toHaveProperty("message");
  });

  it("stops polling on unmount", async () => {
    const { unmount } = renderHook(() => useHealthStatus({ initialDelay: 0, pollInterval: 1000 }));
    await advance(0);
    unmount();
    await advance(10_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
  });

  it('makes exactly one request per poll interval across degraded/healthy transitions', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ status: 'unhealthy' });

    renderHook(() => useHealthStatus());

    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(1));

    mockedFetchHealth.mockResolvedValueOnce({ status: 'ok' });
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(2));

    mockedFetchHealth.mockResolvedValueOnce({ status: 'unhealthy' });
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(3));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(4));
  });
});
