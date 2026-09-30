import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { GET } from "../route";

const C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/onramp/quotes");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalFetch = global.fetch;

describe("GET /api/onramp/quotes (#678)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://backend.example.com";
  });

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects a missing amount", async () => {
    const res = await GET(makeRequest({ cAddress: C_ADDRESS }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive amount", async () => {
    const res = await GET(makeRequest({ amount: "0", cAddress: C_ADDRESS }) as never);
    expect(res.status).toBe(400);
  });

  it("returns empty live quotes without calling the backend when cAddress is absent", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100" }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty live quotes without calling the backend when cAddress is invalid", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: "not-a-real-address" }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty live quotes when NEXT_PUBLIC_API_URL is not configured", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the backend's /api/v1/offramp/quote with the mapped params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ comparison: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await GET(makeRequest({ amount: "250", currency: "EUR", cAddress: C_ADDRESS }) as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.origin).toBe("https://backend.example.com");
    expect(calledUrl.pathname).toBe("/api/v1/offramp/quote");
    expect(calledUrl.searchParams.get("fiatAmount")).toBe("250");
    expect(calledUrl.searchParams.get("fiatCurrency")).toBe("EUR");
    expect(calledUrl.searchParams.get("cryptoCurrency")).toBe("usdc");
    expect(calledUrl.searchParams.get("cAddress")).toBe(C_ADDRESS);
  });

  it("maps a successful backend comparison into per-provider LiveQuoteInput", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        comparison: [
          {
            provider: "moonpay",
            fiatAmount: 100,
            cryptoAmount: 96,
            feeAmount: 4,
            netAmount: 96,
            estimatedRate: 0.96,
          },
          {
            provider: "transak",
            fiatAmount: 100,
            cryptoAmount: 95,
            feeAmount: 5,
            netAmount: 95,
            estimatedRate: 0.95,
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    const body = await res.json();

    expect(body.live).toEqual({
      moonpay: { sourceAmount: "100.00", destinationAmount: "96.00", fee: "4.00" },
      transak: { sourceAmount: "100.00", destinationAmount: "95.00", fee: "5.00" },
    });
  });

  it("drops comparison entries with an unrecognised provider", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        comparison: [
          { provider: "someNewProvider", fiatAmount: 100, cryptoAmount: 90, feeAmount: 10, netAmount: 90 },
        ],
      }),
    }) as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
  });

  it("drops malformed comparison entries missing numeric fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ comparison: [{ provider: "moonpay" }] }),
    }) as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
  });

  it("degrades to empty live quotes when the backend returns a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
  });

  it("degrades to empty live quotes when the backend request throws (network error/timeout)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
  });

  it("degrades to empty live quotes when the backend returns an unexpected shape", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notComparison: "surprise" }),
    }) as unknown as typeof fetch;

    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    const body = await res.json();

    expect(body.live).toEqual({});
  });

  it("always sets Cache-Control: no-store", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ comparison: [] }) }) as unknown as typeof fetch;
    const res = await GET(makeRequest({ amount: "100", cAddress: C_ADDRESS }) as never);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
