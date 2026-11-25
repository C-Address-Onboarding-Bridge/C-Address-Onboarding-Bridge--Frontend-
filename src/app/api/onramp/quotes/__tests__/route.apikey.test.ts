import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const C_ADDRESS = "C" + "A".repeat(55);

describe("GET /api/onramp/quotes", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://backend.test");
    vi.stubEnv("BACKEND_API_KEY", "secret-key");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ comparison: [] }), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("does not 500 for a cAddress request and sends X-API-Key", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/onramp/quotes?amount=100&cAddress=${C_ADDRESS}`)
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["X-API-Key"]).toBe("secret-key");
  });

  it("skips the backend call when BACKEND_API_KEY is unset", async () => {
    vi.stubEnv("BACKEND_API_KEY", "");
    const res = await GET(
      new NextRequest(`http://localhost/api/onramp/quotes?amount=100&cAddress=${C_ADDRESS}`)
    );
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
