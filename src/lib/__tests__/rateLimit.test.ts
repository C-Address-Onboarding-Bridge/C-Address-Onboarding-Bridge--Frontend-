import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIp, resetRateLimits } from "../rateLimit";

describe("checkRateLimit (#674)", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("key-a", { max: 5 }).allowed).toBe(true);
    }
  });

  it("blocks once the limit is exceeded within the window", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("key-b", { max: 5 });
    }
    const result = checkRateLimit("key-b", { max: 5 });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks each key independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("key-c", { max: 5 });
    expect(checkRateLimit("key-c", { max: 5 }).allowed).toBe(false);
    expect(checkRateLimit("key-d", { max: 5 }).allowed).toBe(true);
  });

  it("resets the count once the window elapses", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) checkRateLimit("key-e", { max: 5, windowMs: 1000 });
      expect(checkRateLimit("key-e", { max: 5, windowMs: 1000 }).allowed).toBe(false);

      vi.advanceTimersByTime(1001);
      expect(checkRateLimit("key-e", { max: 5, windowMs: 1000 }).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getClientIp (#674)", () => {
  it("reads the first address from x-forwarded-for", () => {
    const request = new Request("http://localhost/api/backend/locks", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" },
    });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const request = new Request("http://localhost/api/backend/locks", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("falls back to a shared 'unknown' bucket when neither header is present", () => {
    const request = new Request("http://localhost/api/backend/locks");
    expect(getClientIp(request)).toBe("unknown");
  });
});
