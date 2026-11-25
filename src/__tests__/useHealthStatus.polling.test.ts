import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HealthStatus } from "@/lib/api";

/**
 * useHealthStatus drives the status banner (#753): when it starts polling, how
 * often, when it pauses, which statuses count as degraded, and how long a
 * degraded banner is retained after recovery so a blip doesn't flash.
 *
 * @/lib/api is mocked whole: the hook only needs getHealthStatus (and, once
 * #842 lands, the shared unreachableHealthStatus fallback).
 */
const getHealthStatus = vi.fn<() => Promise<HealthStatus | null>>();

vi.mock("@/lib/api", () => ({
  getHealthStatus: () => getHealthStatus(),
  unreachableHealthStatus: () => ({
    status: "unhealthy",
    timestamp: "2026-01-01T00:00:00.000Z",
    services: { horizon: "down", soroban_rpc: "down", api: "down" },
    circuitBreakers: {},
  }),
}));

import { useHealthStatus } from "../hooks/useHealthStatus";

function status(s: HealthStatus["status"]): HealthStatus {
  return { status: s, timestamp: "2026-01-01T00:00:00.000Z", services: { horizon: s === "healthy" ? "up" : "degraded" }, circuitBreakers: {} };
}
const HEALTHY = status("healthy");
const DEGRADED = status("degraded");
const UNHEALTHY = status("unhealthy");

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const OPTS = { initialDelay: 1_000, pollInterval: 10_000, retainTime: 5_000 };

beforeEach(() => {
  vi.useFakeTimers();
  getHealthStatus.mockReset();
  getHealthStatus.mockResolvedValue(HEALTHY);
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useHealthStatus polling", () => {
  it("does nothing before the initial delay, then checks once", async () => {
    const { result } = renderHook(() => useHealthStatus(OPTS));
    expect(result.current.health).toBeNull();
    expect(result.current.isDegraded).toBe(false);

    await advance(999);
    expect(getHealthStatus).not.toHaveBeenCalled();
    await advance(1);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
    expect(result.current.health).toEqual(HEALTHY);
  });

  it("uses the 2s / 30s defaults", async () => {
    renderHook(() => useHealthStatus());
    await advance(2_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(2);
  });

  it("polls on the interval while healthy", async () => {
    renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    await advance(30_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(4);
  });

  it("does not start interval polling if the tab is hidden when the first check runs", async () => {
    setVisibility("hidden");
    renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    await advance(60_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
  });

  it("refetch() runs a check on demand", async () => {
    const { result } = renderHook(() => useHealthStatus(OPTS));
    getHealthStatus.mockResolvedValue(DEGRADED);
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.health).toEqual(DEGRADED);
    expect(result.current.isDegraded).toBe(true);
  });

  it("stops every timer on unmount", async () => {
    const { unmount } = renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    unmount();
    await advance(60_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
  });
});

describe("useHealthStatus degraded detection", () => {
  it.each([
    ["degraded", DEGRADED],
    ["unhealthy", UNHEALTHY],
  ])("flags %s", async (_label, s) => {
    getHealthStatus.mockResolvedValue(s);
    const { result } = renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.health?.status).toBe(s.status);
  });

  it("does not flag healthy", async () => {
    const { result } = renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    expect(result.current.isDegraded).toBe(false);
  });

  it("a null result (nothing to report) is not treated as degraded", async () => {
    getHealthStatus.mockResolvedValue(null);
    const { result } = renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    expect(result.current.isDegraded).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("retries once when the check throws, and uses the retry's status", async () => {
    getHealthStatus.mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce(DEGRADED);
    const { result } = renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe("blip");
    expect(result.current.health).toEqual(DEGRADED);
    expect(result.current.isDegraded).toBe(true);
  });

  it("treats a check that keeps throwing as a total outage (#710)", async () => {
    getHealthStatus.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.health?.status).toBe("unhealthy");
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useHealthStatus retain time", () => {
  it("keeps the degraded flag for retainTime after recovery, then clears it", async () => {
    getHealthStatus.mockResolvedValueOnce(DEGRADED).mockResolvedValue(HEALTHY);
    const { result } = renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    expect(result.current.isDegraded).toBe(true);

    // Next poll comes back healthy: the banner must not drop immediately.
    await advance(10_000);
    expect(result.current.health).toEqual(HEALTHY);
    expect(result.current.isDegraded).toBe(true);

    await advance(4_999);
    expect(result.current.isDegraded).toBe(true);
    await advance(1);
    expect(result.current.isDegraded).toBe(false);
  });

  it("a relapse inside the retain window keeps the banner up", async () => {
    getHealthStatus
      .mockResolvedValueOnce(DEGRADED)
      .mockResolvedValueOnce(HEALTHY)
      .mockResolvedValue(UNHEALTHY);
    const { result } = renderHook(() => useHealthStatus({ ...OPTS, pollInterval: 2_000 }));
    await advance(1_000); // degraded
    await advance(2_000); // healthy: retain timer armed
    await advance(2_000); // unhealthy again, inside the 5s window
    await advance(10_000); // well past the original retain deadline
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.health?.status).toBe("unhealthy");
  });

  it("clears after retainTime even when polls are more frequent than the window", async () => {
    getHealthStatus.mockResolvedValueOnce(DEGRADED).mockResolvedValue(HEALTHY);
    const { result } = renderHook(() => useHealthStatus({ ...OPTS, pollInterval: 1_000 }));
    await advance(1_000); // degraded
    await advance(1_000); // first healthy poll starts the 5s window
    await advance(4_999);
    expect(result.current.isDegraded).toBe(true);
    await advance(1);
    expect(result.current.isDegraded).toBe(false);
  });

  it("keeps polling on pollInterval across degraded/healthy transitions", async () => {
    getHealthStatus.mockResolvedValueOnce(DEGRADED).mockResolvedValue(HEALTHY);
    renderHook(() => useHealthStatus(OPTS));
    await advance(1_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
    // A transition used to restart polling on initialDelay (1s) instead.
    await advance(9_999);
    expect(getHealthStatus).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(getHealthStatus).toHaveBeenCalledTimes(2);
    await advance(10_000);
    expect(getHealthStatus).toHaveBeenCalledTimes(3);
  });
});
