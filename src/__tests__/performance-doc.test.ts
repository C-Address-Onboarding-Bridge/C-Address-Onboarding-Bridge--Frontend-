import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * #899 — docs/PERFORMANCE.md accuracy guard.
 *
 * These tests fail if unimplemented monitoring/enforcement claims are
 * re-introduced into the doc. They are intentionally coarse string checks:
 * the doc is prose, not code, so we can only assert that known-false
 * statements are absent.
 */

const docPath = resolve(__dirname, "../../docs/PERFORMANCE.md");
const content = readFileSync(docPath, "utf-8");
const lower = content.toLowerCase();

describe("docs/PERFORMANCE.md — no unimplemented claims (#899)", () => {
  it("does not claim Lighthouse scores are tracked in CI", () => {
    // The CI workflow has no Lighthouse step.
    expect(lower).not.toMatch(/lighthouse.*tracked in ci/i);
    expect(lower).not.toMatch(/tracked in ci.*lighthouse/i);
  });

  it("does not claim PR bundle-delta comments are posted automatically", () => {
    // No CI step posts bundle analysis to PRs.
    expect(lower).not.toContain("pull request comments");
    expect(lower).not.toContain("pr reports");
  });

  it("does not document the --widget analyzer flag", () => {
    // `npm run analyze -- --widget` is not a real flag; nothing reads it.
    expect(lower).not.toContain("--widget");
  });

  it("does not claim the service worker reports Web Vitals", () => {
    // public/sw.js is a caching SW only; it never sends vitals data.
    expect(lower).not.toMatch(/service worker.*web vitals/i);
    expect(lower).not.toMatch(/web vitals.*service worker/i);
    expect(lower).not.toMatch(/via service worker/i);
  });

  it("does not present stale CWV numbers as current measurements", () => {
    // The old doc had a table with '~85', '~2.1 s', '~0.05', '~80ms' as
    // "Current" figures with no source. Those columns must be gone.
    expect(lower).not.toMatch(/\|\s*current\s*\|/);
  });

  it("documents what the webpack budget measures", () => {
    // The replacement doc must explain maxEntrypointSize vs per-route HTML.
    expect(lower).toContain("maxentrypointsize");
    expect(lower).toContain("maxassetsize");
  });
});
