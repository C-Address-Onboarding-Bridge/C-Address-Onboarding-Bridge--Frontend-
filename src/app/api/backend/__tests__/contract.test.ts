import { describe, it, expect } from "vitest";
import { BACKEND_ROUTES } from "@/lib/backendProxy";

/**
 * Contract test (#1007): every backend path a proxy route forwards to must be
 * in BACKEND_ROUTES — the list of endpoints confirmed to exist on the backend.
 * A route pointing at a path that isn't there (the /locks, /locks/:id/claim
 * and /referrals/stats 404s this issue fixed) fails here instead of in
 * production.
 */

/** Turns a concrete proxied path into its BACKEND_ROUTES template form. */
function toTemplate(path: string): string {
  const withoutQuery = path.split("?")[0];
  return withoutQuery.replace(/\/[^/]+\/claim$/, "/:id/claim");
}

const PROXIED_PATHS = [
  "/api/v1/fund/timelocked",
  "/api/v1/fund/timelocked?recipient=G123&network=TESTNET",
  "/api/v1/fund/timelocked/lock-1/claim",
  "/api/v1/fund/timelocked/weird%20id/claim",
  "/api/v1/referrals/stats?address=G1&network=TESTNET",
];

describe("backend proxy contract (#1007)", () => {
  it.each(PROXIED_PATHS)("%s targets a confirmed backend route", (path) => {
    expect(BACKEND_ROUTES).toContain(toTemplate(path));
  });

  it("every confirmed backend route uses the /api/v1 prefix", () => {
    for (const route of BACKEND_ROUTES) {
      expect(route.startsWith("/api/v1/")).toBe(true);
    }
  });
});
