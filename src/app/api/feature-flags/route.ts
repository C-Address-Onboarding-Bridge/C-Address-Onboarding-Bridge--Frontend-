import { NextResponse } from "next/server";
import { FEATURE_FLAGS, type FeatureFlag } from "@/lib/featureFlags";

/**
 * Serves feature flag definitions from the server rather than the client
 * bundle (#490, #679).
 *
 * The route used to just re-serve the `FEATURE_FLAGS` constant compiled into
 * the client bundle, so a "remote" flag could never actually differ from the
 * bundle and a rollout change still needed a redeploy -- the same problem
 * #490 had already fixed on the client side (`fetchRemoteFlags` treats this
 * route as the source of truth), just not here on the server side.
 *
 * FEATURE_FLAGS_JSON, when set, is validated and served instead. This is
 * intentionally the simplest "configurable source" that satisfies the
 * contract (a JSON array the client already knows how to consume) without
 * guessing at a database schema or an edge-config provider this repo has
 * never integrated with; swapping the body of `loadConfiguredFlags` for a
 * real backend/edge-config call is a drop-in change later, since callers
 * only depend on it returning `FeatureFlag[]`.
 *
 * No-store: flag state must never be served from an intermediary cache, or a
 * flag flipped off in an incident would keep looking "on" to some clients.
 */

function isValidFeatureFlag(value: unknown): value is FeatureFlag {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    v.key.trim().length > 0 &&
    typeof v.name === "string" &&
    typeof v.description === "string" &&
    typeof v.defaultEnabled === "boolean" &&
    typeof v.rolloutPercentage === "number" &&
    Number.isFinite(v.rolloutPercentage) &&
    v.rolloutPercentage >= 0 &&
    v.rolloutPercentage <= 100
  );
}

/**
 * Reads and validates FEATURE_FLAGS_JSON. Falls back to the bundled
 * `FEATURE_FLAGS` defaults when the env var is unset, isn't valid JSON, or
 * doesn't decode to an array of valid `FeatureFlag` objects -- a malformed
 * remote source must never crash the route or serve a partially-shaped flag
 * that the client's `isFeatureEnabled` isn't prepared for.
 */
function loadConfiguredFlags(): FeatureFlag[] {
  const raw = process.env.FEATURE_FLAGS_JSON;
  if (!raw) return FEATURE_FLAGS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("FEATURE_FLAGS_JSON is not valid JSON; falling back to bundled defaults.");
    return FEATURE_FLAGS;
  }

  if (!Array.isArray(parsed) || !parsed.every(isValidFeatureFlag)) {
    console.error("FEATURE_FLAGS_JSON did not decode to a valid FeatureFlag[]; falling back to bundled defaults.");
    return FEATURE_FLAGS;
  }

  return parsed;
}

export async function GET() {
  return NextResponse.json(loadConfiguredFlags(), {
    headers: { "Cache-Control": "no-store" },
  });
}
