import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetRateLimits } from "../rateLimit";

/**
 * Tests for proxyToBackend (#674): the shared helper every route under
 * src/app/api/backend/ calls. Covers the two things this feature exists
 * for — the API key never comes from the client, and a per-IP rate limit
 * applies — plus the misconfiguration and forwarding paths.
 */

const originalFetch = global.fetch;
const originalApiKey = process.env.BACKEND_API_KEY;

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, { headers: { "x-forwarded-for": "203.0.113.5" }, ...init });
}

beforeEach(() => {
  resetRateLimits();
  process.env.BACKEND_API_KEY = "test-key-123";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

describe("proxyToBackend", () => {
  it("attaches the server-only API key and forwards to the configured backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    global.fetch = fetchMock;

    const { proxyToBackend } = await import("../backendProxy");
    const response = await proxyToBackend(makeRequest("http://localhost/api/backend/locks?recipient=G123&network=TESTNET"), "/locks?recipient=G123&network=TESTNET");

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/locks?recipient=G123&network=TESTNET");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("test-key-123");
  });

  it("forwards the request body and method for a POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    global.fetch = fetchMock;

    const { proxyToBackend } = await import("../backendProxy");
    const body = JSON.stringify({ from: "G1", recipient: "G2", amount: "10" });
    await proxyToBackend(makeRequest("http://localhost/api/backend/locks", { method: "POST", body }), "/locks");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
  });

  it("returns 500 without calling the backend when BACKEND_API_KEY is not set", async () => {
    delete process.env.BACKEND_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const { proxyToBackend } = await import("../backendProxy");
    const response = await proxyToBackend(makeRequest("http://localhost/api/backend/locks"), "/locks");

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks a caller once they exceed the per-IP rate limit", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchMock;

    const { proxyToBackend } = await import("../backendProxy");
    // The real limit is higher than this; the point is only that *some*
    // fixed number of requests from the same IP eventually gets rejected,
    // without hardcoding the production limit into the test.
    let lastStatus = 200;
    for (let i = 0; i < 50; i++) {
      const response = await proxyToBackend(makeRequest("http://localhost/api/backend/locks"), "/locks");
      lastStatus = response.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
    expect(fetchMock.mock.calls.length).toBeLessThan(50);
  });

  it("rate-limits different IPs independently", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchMock;

    const { proxyToBackend } = await import("../backendProxy");
    for (let i = 0; i < 30; i++) {
      await proxyToBackend(makeRequest("http://localhost/api/backend/locks"), "/locks");
    }
    const otherIpRequest = new Request("http://localhost/api/backend/locks", {
      headers: { "x-forwarded-for": "198.51.100.7" },
    });
    const response = await proxyToBackend(otherIpRequest, "/locks");
    expect(response.status).toBe(200);
  });
});
