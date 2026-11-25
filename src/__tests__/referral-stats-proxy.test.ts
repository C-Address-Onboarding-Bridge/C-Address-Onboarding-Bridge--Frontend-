import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, getReferralStats } from "@/lib/api";

/**
 * #843: getReferralStats was declared twice in api.ts and both copies called
 * the backend directly from the browser, without the X-API-Key the backend
 * requires. It must go through the same-origin proxy route instead.
 */

/** Minimal fetch response, in the same shape the other suites mock. */
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
const STATS = { referralCount: 2, totalVolume: "150", rewardsEarned: "1.5" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getReferralStats (#843)", () => {
  it("requests the proxy route, not the backend directly", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(STATS, 200)
    );

    await expect(getReferralStats(ADDRESS, "TESTNET")).resolves.toEqual(STATS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe(`/api/backend/referrals/stats?address=${ADDRESS}&network=TESTNET`);
    expect(url.startsWith(API_BASE_URL)).toBe(false);
  });

  it("encodes the query parameters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(STATS, 200)
    );

    await getReferralStats("G&x=1", "PUBLIC");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/backend/referrals/stats?address=G%26x%3D1&network=PUBLIC"
    );
  });

  it("returns null on a non-2xx response or a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(null, 401));
    await expect(getReferralStats(ADDRESS, "TESTNET")).resolves.toBeNull();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));
    await expect(getReferralStats(ADDRESS, "TESTNET")).resolves.toBeNull();
  });

  it("is declared exactly once", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/api.ts"), "utf8");
    expect(source.match(/export async function getReferralStats\b/g)).toHaveLength(1);
  });
});
