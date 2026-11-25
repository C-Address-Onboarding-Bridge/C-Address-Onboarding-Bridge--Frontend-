import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealthStatus } from "@/lib/api";

/**
 * #840: getHealthStatus did not parse (a `catch` with no `try`), which broke
 * every import of the API client. It must try once, retry once, and then
 * resolve with a complete unhealthy status.
 */

/** Minimal fetch response, in the same shape the other suites mock. */
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getHealthStatus retry (#840)", () => {
  it("makes exactly two requests when both fail, then reports unhealthy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));

    const health = await getHealthStatus();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(health.status).toBe("unhealthy");
    expect(health.services).toEqual({ horizon: "down", soroban_rpc: "down", api: "down" });
    expect(health.circuitBreakers).toEqual({});
  });

  it("treats non-2xx responses as failures and retries once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(null, 503));

    const health = await getHealthStatus();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(health.status).toBe("unhealthy");
  });

  it("makes a single request when the first succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ status: "ok", dependencies: {}, circuits: {} }, 200));

    const health = await getHealthStatus();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(health.status).toBe("healthy");
  });
});
