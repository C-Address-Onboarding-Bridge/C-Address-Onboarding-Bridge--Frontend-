import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribeToTransactionStatus } from "@/lib/stellar";

type Listener = (event: MessageEvent<string>) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  onmessage: Listener | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emitMessage(data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    this.onmessage?.(event);
  }

  emitNamedEvent(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }

  close() {
    this.closed = true;
  }
}

describe("subscribeToTransactionStatus SSE timeout reconnection (#952)", () => {
  const HASH = "a".repeat(64);
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    fetchSpy.mockReset();
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps transport as SSE across a 30s timeout and confirms a 45s pending transaction without falling back to polling", async () => {
    const statuses: string[] = [];

    const subscription = subscribeToTransactionStatus({
      hash: HASH,
      network: "TESTNET",
      onStatus: (status) => statuses.push(status),
    });

    expect(subscription.transport).toBe("sse");
    expect(MockEventSource.instances).toHaveLength(1);

    // t = 0s: initial pending status on first SSE stream
    MockEventSource.instances[0].emitMessage({ status: "pending" });
    expect(statuses).toEqual(["pending"]);

    // t = 30s: server reaches MAX_DURATION_MS, sends `event: timeout` and closes
    await vi.advanceTimersByTimeAsync(30_000);
    MockEventSource.instances[0].emitNamedEvent("timeout", { reason: "stream_timeout" });
    MockEventSource.instances[0].emitError();

    // Client should have reconnected with a second EventSource and stayed on SSE
    expect(MockEventSource.instances).toHaveLength(2);
    expect(subscription.transport).toBe("sse");
    expect(fetchSpy).not.toHaveBeenCalled();

    // t = 45s: transaction lands on the second SSE stream
    await vi.advanceTimersByTimeAsync(15_000);
    MockEventSource.instances[1].emitMessage({ status: "confirmed" });

    expect(statuses).toEqual(["pending", "confirmed"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(MockEventSource.instances[1].closed).toBe(true);
  });

  it("falls back to polling only after repeated consecutive SSE errors", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "pending" }),
    });

    const subscription = subscribeToTransactionStatus({
      hash: HASH,
      network: "TESTNET",
      onStatus: () => {},
    });

    const es = MockEventSource.instances[0];
    es.emitError();
    expect(subscription.transport).toBe("sse");
    es.emitError();
    expect(subscription.transport).toBe("sse");
    es.emitError();

    expect(subscription.transport).toBe("polling");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    subscription.unsubscribe();
  });
});