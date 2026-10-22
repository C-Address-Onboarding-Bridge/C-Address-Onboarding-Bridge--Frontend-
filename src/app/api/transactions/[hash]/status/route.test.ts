import { describe, it, expect, vi, beforeEach } from "vitest";

const callMock = vi.fn();

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: {
    Server: class {
      transactions() {
        return { transaction: () => ({ call: callMock }) };
      }
    },
  },
}));

import { GET } from "./route";

const HASH = "a".repeat(64);

function req(hash: string, query = "") {
  return GET(
    new Request(`http://localhost/api/transactions/${hash}/status${query}`, {
      headers: { "x-forwarded-for": `ip-${Math.random()}` },
    }),
    { params: Promise.resolve({ hash }) },
  );
}

describe("GET /api/transactions/[hash]/status", () => {
  beforeEach(() => callMock.mockReset());

  it("returns 400 for a bad hash", async () => {
    const res = await req("nothex");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a bad network", async () => {
    const res = await req(HASH, "?network=BOGUS");
    expect(res.status).toBe(400);
  });

  it("returns 200 JSON for a valid hash", async () => {
    callMock.mockResolvedValue({
      successful: true,
      ledger_attr: 42,
      created_at: "2024-01-01T00:00:00Z",
    });
    const res = await req(HASH);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ hash: HASH, status: "confirmed", ledger: 42 });
  });
});
