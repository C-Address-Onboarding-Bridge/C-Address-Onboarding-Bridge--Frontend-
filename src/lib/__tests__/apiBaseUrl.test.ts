import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Tests for the NEXT_PUBLIC_API_URL guard (#675).
 *
 * API_BASE_URL used to fall back to 'https://api.example.com' unconditionally
 * — a production deploy that forgot the env var would silently send every
 * request to a domain this project doesn't control. src/lib/api.ts is
 * re-imported fresh (vi.resetModules) for each case here since the guard
 * runs once, at module load, not per-call.
 */

const originalNodeEnv = process.env.NODE_ENV;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

function setNodeEnv(value: string | undefined) {
  (process.env as { NODE_ENV?: string }).NODE_ENV = value;
}

afterEach(() => {
  setNodeEnv(originalNodeEnv);
  process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  vi.resetModules();
});

describe("API_BASE_URL configuration guard", () => {
  it("throws at import time when NEXT_PUBLIC_API_URL is missing in production", async () => {
    vi.resetModules();
    setNodeEnv("production");
    delete process.env.NEXT_PUBLIC_API_URL;

    await expect(import("../api")).rejects.toThrow(/NEXT_PUBLIC_API_URL is not set/);
  });

  it("does not throw in production when NEXT_PUBLIC_API_URL is set", async () => {
    vi.resetModules();
    setNodeEnv("production");
    process.env.NEXT_PUBLIC_API_URL = "https://api.real-backend.example";

    await expect(import("../api")).resolves.toBeDefined();
  });

  it("falls back to the placeholder outside production so local dev/test need no env var", async () => {
    vi.resetModules();
    setNodeEnv("test");
    delete process.env.NEXT_PUBLIC_API_URL;

    await expect(import("../api")).resolves.toBeDefined();
  });
});
