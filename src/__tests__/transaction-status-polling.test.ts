import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToTransactionStatus } from "@/lib/stellar";

describe("subscribeToTransactionStatus polling fallback concurrency & backoff (#1114)", () => {
  const originalEventSource = global.EventSource;
  const originalDocument = global.document;

  beforeEach(() => {
    vi.useFakeTimers();
    // Simulate environment without EventSource to force polling fallback
    // @ts-ignore
    delete global.EventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    global.EventSource = originalEventSource;
    global.document = originalDocument;
    vi.restoreAllMocks();
  });

  it("leaves only one poll chain when hidden and shown during an in-flight fetch", async () => {
    let visibility = "visible";
    const visibilityListeners: (() => void)[] = [];

    // Mock document with visibilityState
    // @ts-ignore
    global.document = {
      get visibilityState() {
        return visibility;
      },
      addEventListener: vi.fn((event, cb) => {
        if (event === "visibilitychange") visibilityListeners.push(cb);
      }),
      removeEventListener: vi.fn(),
    };

    let fetchCount = 0;
    let pendingFetchResolve: ((value: any) => void) | null = null;

    vi.spyOn(global, "fetch").mockImplementation(() => {
      fetchCount++;
      return new Promise((resolve) => {
        pendingFetchResolve = resolve;
      });
    });

    const onStatus = vi.fn();
    const onError = vi.fn();

    const sub = subscribeToTransactionStatus({
      hash: "abc123hash",
      network: "TESTNET",
      onStatus,
      onError,
      pollIntervalMs: 5000,
    });

    expect(fetchCount).toBe(1);

    // Tab is hidden while fetch is in-flight
    visibility = "hidden";
    visibilityListeners.forEach((fn) => fn());

    // Resolve the in-flight fetch after tab is hidden
    pendingFetchResolve!({
      ok: true,
      status: 200,
      json: async () => ({ status: "pending" }),
    });
    await vi.advanceTimersByTimeAsync(0);

    // Tab becomes visible again
    visibility = "visible";
    visibilityListeners.forEach((fn) => fn());

    expect(fetchCount).toBe(2);

    // Resolve the second fetch
    pendingFetchResolve!({
      ok: true,
      status: 200,
      json: async () => ({ status: "pending" }),
    });
    await vi.advanceTimersByTimeAsync(0);

    // Advance by 5000ms: only ONE next fetch must trigger (strictly one chain)
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(3);

    sub.unsubscribe();
  });

  it("delays the next fetch by Retry-After seconds on 429 response", async () => {
    let fetchCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      fetchCount++;
      if (fetchCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "20" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "confirmed" }),
      } as Response;
    });

    const onStatus = vi.fn();
    const onError = vi.fn();

    const sub = subscribeToTransactionStatus({
      hash: "abc123hash",
      network: "TESTNET",
      onStatus,
      onError,
      pollIntervalMs: 5000,
    });

    expect(fetchCount).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalled();

    // Advance 5 seconds (standard poll interval) - must NOT fetch yet because of Retry-After: 20s
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(1);

    // Advance remaining 15 seconds (total 20s) - should now fire next fetch
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchCount).toBe(2);
    expect(onStatus).toHaveBeenCalledWith("confirmed");

    sub.unsubscribe();
  });

  it("applies exponential backoff on 5xx server errors", async () => {
    let fetchCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      fetchCount++;
      return {
        ok: false,
        status: 502,
        headers: new Headers(),
      } as Response;
    });

    const onStatus = vi.fn();
    const onError = vi.fn();

    const sub = subscribeToTransactionStatus({
      hash: "abc123hash",
      network: "TESTNET",
      onStatus,
      onError,
      pollIntervalMs: 5000,
    });

    expect(fetchCount).toBe(1);
    await vi.advanceTimersByTimeAsync(0);

    // 1st 502 error: backoff doubles from 5s to 10s
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(1); // not yet
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(2); // fired at 10s
    await vi.advanceTimersByTimeAsync(0);

    // 2nd 502 error: backoff doubles from 10s to 20s
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchCount).toBe(2); // not yet
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchCount).toBe(3); // fired at 20s

    sub.unsubscribe();
  });
});
