import { describe, it, expect, afterEach } from "vitest";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { GET } from "../route";

const ENV_KEY = "FEATURE_FLAGS_JSON";

describe("GET /api/feature-flags (#679)", () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("serves the bundled defaults when FEATURE_FLAGS_JSON is unset", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual(FEATURE_FLAGS);
  });

  it("serves flags from FEATURE_FLAGS_JSON when it is a valid FeatureFlag[]", async () => {
    const configured = [
      {
        key: "remote_only_flag",
        name: "Remote Only",
        description: "Only exists in the remote config",
        defaultEnabled: true,
        rolloutPercentage: 100,
      },
    ];
    process.env[ENV_KEY] = JSON.stringify(configured);

    const res = await GET();
    await expect(res.json()).resolves.toEqual(configured);
  });

  it("falls back to the bundled defaults when FEATURE_FLAGS_JSON is not valid JSON", async () => {
    process.env[ENV_KEY] = "{not json";

    const res = await GET();
    await expect(res.json()).resolves.toEqual(FEATURE_FLAGS);
  });

  it("falls back to the bundled defaults when FEATURE_FLAGS_JSON is not an array", async () => {
    process.env[ENV_KEY] = JSON.stringify({ key: "x" });

    const res = await GET();
    await expect(res.json()).resolves.toEqual(FEATURE_FLAGS);
  });

  it("falls back to the bundled defaults when an entry is missing required fields", async () => {
    process.env[ENV_KEY] = JSON.stringify([{ key: "incomplete" }]);

    const res = await GET();
    await expect(res.json()).resolves.toEqual(FEATURE_FLAGS);
  });

  it("falls back to the bundled defaults when rolloutPercentage is out of range", async () => {
    process.env[ENV_KEY] = JSON.stringify([
      {
        key: "bad_rollout",
        name: "Bad Rollout",
        description: "rolloutPercentage out of range",
        defaultEnabled: false,
        rolloutPercentage: 150,
      },
    ]);

    const res = await GET();
    await expect(res.json()).resolves.toEqual(FEATURE_FLAGS);
  });

  it("always sets Cache-Control: no-store", async () => {
    process.env[ENV_KEY] = JSON.stringify([
      {
        key: "x",
        name: "x",
        description: "x",
        defaultEnabled: false,
        rolloutPercentage: 0,
      },
    ]);

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
