import { describe, it, expect, vi, afterEach } from "vitest";
import { getHealthStatus, getStatusMessage, isServiceDegraded, parseHealthResponse } from "../api";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// A captured example of the backend's actual GET /health response (#670) —
// `status: 'ok'`, `dependencies`, `circuits` — not the `healthy`/`services`/
// `circuitBreakers` shape src/lib/api.ts used to assume.
const CAPTURED_HEALTHY_RESPONSE = {
  status: "ok",
  timestamp: "2026-08-27T12:00:00Z",
  dependencies: {
    horizon: "up",
    soroban_rpc: "up",
    api: "up",
  },
  circuits: {},
};

const CAPTURED_DEGRADED_RESPONSE = {
  status: "degraded",
  timestamp: "2026-08-27T12:05:00Z",
  dependencies: {
    horizon: "degraded",
    soroban_rpc: "up",
    api: "up",
  },
  circuits: {
    transaction_submission: {
      state: "half-open",
      failures: 3,
      lastFailure: "2026-08-27T12:04:00Z",
    },
  },
};

describe("parseHealthResponse", () => {
  it("maps a captured healthy backend response into the UI model", () => {
    expect(parseHealthResponse(CAPTURED_HEALTHY_RESPONSE)).toEqual({
      status: "healthy",
      timestamp: "2026-08-27T12:00:00Z",
      services: { horizon: "up", soroban_rpc: "up", api: "up" },
      circuitBreakers: {},
    });
  });

  it("maps a captured degraded backend response, renaming dependencies/circuits", () => {
    expect(parseHealthResponse(CAPTURED_DEGRADED_RESPONSE)).toEqual({
      status: "degraded",
      timestamp: "2026-08-27T12:05:00Z",
      services: { horizon: "degraded", soroban_rpc: "up", api: "up" },
      circuitBreakers: {
        transaction_submission: { state: "half-open", failures: 3, lastFailure: "2026-08-27T12:04:00Z" },
      },
    });
  });

  it("normalizes an unhealthy status through unchanged", () => {
    expect(parseHealthResponse({ status: "unhealthy", dependencies: {}, circuits: {} })?.status).toBe("unhealthy");
  });

  it("degrades a response with no dependencies/circuits to empty maps instead of throwing", () => {
    expect(parseHealthResponse({ status: "ok" })).toEqual({
      status: "healthy",
      timestamp: null,
      services: {},
      circuitBreakers: {},
    });
  });

  it("drops dependency entries with an unrecognized state instead of passing them through", () => {
    const result = parseHealthResponse({ status: "ok", dependencies: { horizon: "up", weird: "sideways" } });
    expect(result?.services).toEqual({ horizon: "up" });
  });

  it("returns null for a non-object payload", () => {
    expect(parseHealthResponse(null)).toBeNull();
    expect(parseHealthResponse("ok")).toBeNull();
  });
});

describe("getHealthStatus", () => {
  it("fetches and maps the real backend shape end to end", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(CAPTURED_DEGRADED_RESPONSE),
    });

    const health = await getHealthStatus();
    expect(health?.status).toBe("degraded");
    expect(health?.services.horizon).toBe("degraded");
  });

  it("returns null on a network failure without throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(getHealthStatus()).resolves.toBeNull();
  });
});

describe("getStatusMessage / isServiceDegraded with the mapped model", () => {
  it("does not throw building a message for a mapped degraded response (previously crashed on health.services being undefined)", () => {
    const health = parseHealthResponse(CAPTURED_DEGRADED_RESPONSE);
    expect(isServiceDegraded(health)).toBe(true);
    expect(getStatusMessage(health)).toMatch(/horizon/);
  });

  it("reports no message for a mapped healthy ('ok') response", () => {
    const health = parseHealthResponse(CAPTURED_HEALTHY_RESPONSE);
    expect(isServiceDegraded(health)).toBe(false);
    expect(getStatusMessage(health)).toBeNull();
  });
});
