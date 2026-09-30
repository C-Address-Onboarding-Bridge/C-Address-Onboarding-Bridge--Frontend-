import { describe, it, expect } from "vitest";
import { isFeatureEnabled, FEATURE_FLAGS } from "../featureFlags";

/**
 * The lock/claims feature (#467) calls /locks routes that don't exist on the
 * backend and, until #672, let a claim through with no proof of caller
 * control — hidden behind this flag until both are resolved.
 *
 * A fresh test file so `remoteFlagsMemo` (a module-level singleton other
 * featureFlags tests populate via fetchRemoteFlags) starts null here,
 * exercising the real bundled default rather than state left over from
 * another test.
 */
describe("locked_transfers feature flag (#672)", () => {
  it("is off by default", () => {
    expect(isFeatureEnabled("locked_transfers")).toBe(false);
  });

  it("is registered as disabled with no rollout", () => {
    const flag = FEATURE_FLAGS.find((f) => f.key === "locked_transfers");
    expect(flag).toMatchObject({ defaultEnabled: false, rolloutPercentage: 0 });
  });
});
