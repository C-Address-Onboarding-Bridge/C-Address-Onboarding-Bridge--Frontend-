import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Wiring tests for the backend proxy routes (#674): each route file is a
 * thin adapter over proxyToBackend (tested on its own in
 * src/lib/__tests__/backendProxy.test.ts) — these just confirm each route
 * forwards to the backend path src/lib/api.ts actually calls, including the
 * incoming query string for GET routes and the :id param for the claim
 * route.
 */

const proxyToBackendMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

vi.mock("@/lib/backendProxy", () => ({
  proxyToBackend: proxyToBackendMock,
}));

beforeEach(() => {
  proxyToBackendMock.mockClear();
});

function makeRequest(url: string, method = "GET"): Request {
  return new Request(url, { method });
}

describe("backend proxy route wiring", () => {
  it("POST /api/backend/batch-fund -> /batch-fund", async () => {
    const { POST } = await import("../batch-fund/route");
    const request = makeRequest("http://localhost/api/backend/batch-fund", "POST");
    await POST(request);
    expect(proxyToBackendMock).toHaveBeenCalledWith(request, "/batch-fund");
  });

  it("POST /api/backend/locks -> /locks", async () => {
    const { POST } = await import("../locks/route");
    const request = makeRequest("http://localhost/api/backend/locks", "POST");
    await POST(request);
    expect(proxyToBackendMock).toHaveBeenCalledWith(request, "/locks");
  });

  it("GET /api/backend/locks?... -> /locks?... (query string preserved)", async () => {
    const { GET } = await import("../locks/route");
    const request = makeRequest("http://localhost/api/backend/locks?recipient=G123&network=TESTNET");
    await GET(request);
    expect(proxyToBackendMock).toHaveBeenCalledWith(request, "/locks?recipient=G123&network=TESTNET");
  });

  it("POST /api/backend/locks/:id/claim -> /locks/:id/claim", async () => {
    const { POST } = await import("../locks/[id]/claim/route");
    const request = makeRequest("http://localhost/api/backend/locks/lock-1/claim", "POST");
    await POST(request, { params: Promise.resolve({ id: "lock-1" }) });
    expect(proxyToBackendMock).toHaveBeenCalledWith(request, "/locks/lock-1/claim");
  });

  it("encodes the lock id in the claim route path", async () => {
    const { POST } = await import("../locks/[id]/claim/route");
    const request = makeRequest("http://localhost/api/backend/locks/weird%20id/claim", "POST");
    await POST(request, { params: Promise.resolve({ id: "weird id" }) });
    expect(proxyToBackendMock).toHaveBeenCalledWith(request, "/locks/weird%20id/claim");
  });

  it("GET /api/backend/fee-tiers/preview?... -> /fee-tiers/preview?...", async () => {
    const { GET } = await import("../fee-tiers/preview/route");
    const request = makeRequest("http://localhost/api/backend/fee-tiers/preview?address=G1&network=TESTNET");
    await GET(request);
    expect(proxyToBackendMock).toHaveBeenCalledWith(request, "/fee-tiers/preview?address=G1&network=TESTNET");
  });

  it("GET /api/backend/referrals/stats?... -> /referrals/stats?...", async () => {
    const { GET } = await import("../referrals/stats/route");
    const request = makeRequest("http://localhost/api/backend/referrals/stats?address=G1&network=TESTNET");
    await GET(request);
    expect(proxyToBackendMock).toHaveBeenCalledWith(request, "/referrals/stats?address=G1&network=TESTNET");
  });

  it("GET /api/backend/transactions/export?... -> /transactions/export?...", async () => {
    const { GET } = await import("../transactions/export/route");
    const request = makeRequest("http://localhost/api/backend/transactions/export?address=G1&network=TESTNET&from=0&to=1&limit=200");
    await GET(request);
    expect(proxyToBackendMock).toHaveBeenCalledWith(
      request,
      "/transactions/export?address=G1&network=TESTNET&from=0&to=1&limit=200"
    );
  });
});
