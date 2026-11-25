import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #848: next 16.0.0–16.3.7 is affected by GHSA-cjq9-62q9-8jv4,
 * GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p and GHSA-f87g-xv8r-7p7x, and the
 * blocking `npm audit --audit-level=high` CI step fails on it. Guard both the
 * declared and the locked versions, and keep the Next tooling on the same minor.
 */

const read = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8"));
const pkg = read("package.json");
const lock = read("package-lock.json");

/** [major, minor, patch] of a plain version, ignoring a leading ^ or ~. */
function parse(version: string): [number, number, number] {
  const match = /^[\^~]?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`unparseable version ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAffected(version: string): boolean {
  const [major, minor, patch] = parse(version);
  return major === 16 && (minor < 3 || (minor === 3 && patch <= 7));
}

describe("next is outside the advisory range (#848)", () => {
  it("declares a patched next", () => {
    expect(pkg.dependencies.next).toBe("16.4.1");
    expect(isAffected(pkg.dependencies.next)).toBe(false);
  });

  it("locks a patched next", () => {
    const locked = lock.packages["node_modules/next"].version as string;
    expect(isAffected(locked)).toBe(false);
  });

  it("keeps eslint-config-next and @next/bundle-analyzer on the same minor", () => {
    expect(pkg.devDependencies["eslint-config-next"]).toBe("16.4.1");
    expect(parse(pkg.devDependencies["@next/bundle-analyzer"]).slice(0, 2)).toEqual([16, 4]);
    expect(isAffected(lock.packages["node_modules/eslint-config-next"].version)).toBe(false);
  });

  it("recognises the affected range", () => {
    expect(isAffected("16.3.6")).toBe(true);
    expect(isAffected("16.3.7")).toBe(true);
    expect(isAffected("16.0.0")).toBe(true);
    expect(isAffected("16.4.1")).toBe(false);
  });
});
