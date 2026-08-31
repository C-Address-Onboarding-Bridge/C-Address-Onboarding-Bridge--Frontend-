import { NextResponse } from "next/server";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

/**
 * Serves feature flag definitions from the server rather than the client
 * bundle (#490). Today this returns the same definitions that used to be
 * hardcoded on the client, but because it's a server endpoint the values it
 * returns can change — from an admin tool, a database, a config service —
 * without a client redeploy, which is the entire point of having flags.
 *
 * No-store: flag state must never be served from an intermediary cache, or a
 * flag flipped off in an incident would keep looking "on" to some clients.
 */
export async function GET() {
  return NextResponse.json(FEATURE_FLAGS, {
    headers: { "Cache-Control": "no-store" },
  });
}
