import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

/**
 * #902 — .env.example completeness guard.
 *
 * Walks every .ts / .tsx file under src/ looking for `process.env.X`
 * references (where X is an ALL_CAPS identifier). For each one it finds,
 * it asserts that X appears in .env.example. This test fails if a developer
 * adds a new env var to the code without documenting it in .env.example.
 *
 * Exclusions:
 *   - NODE_ENV: a Node.js built-in; not a project-specific var.
 *   - __tests__ helper usages that just read/restore existing vars in test
 *     tear-down are still caught, but they reference vars already in the list.
 */

const ROOT = resolve(__dirname, "../..");
const SRC_DIR = join(ROOT, "src");
const ENV_EXAMPLE_PATH = join(ROOT, ".env.example");

// Vars that are Node.js / Next.js built-ins, not project-specific.
const EXCLUDED = new Set(["NODE_ENV"]);

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTs(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

const files = walkTs(SRC_DIR);

// Collect all env var names referenced in source (deduped).
// Strip comment lines and block-comment spans first so that a var name
// that only appears in a `* process.env.X` doc comment does not create a
// false requirement.
const envVarRe = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const referencedVars = new Set<string>();

for (const file of files) {
  // Remove single-line comments (// ...) and block comments (/* ... */)
  // before scanning so that var names only mentioned in JSDoc / comments
  // don't create spurious requirements.
  const raw = readFileSync(file, "utf-8");
  const noComments = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")       // block comments
    .replace(/\/\/[^\n]*/g, "");             // line comments

  for (const [, name] of noComments.matchAll(envVarRe)) {
    if (!EXCLUDED.has(name)) {
      referencedVars.add(name);
    }
  }
}

// Parse the vars declared in .env.example (lines starting with VAR_NAME= or # VAR_NAME=).
const exampleContent = readFileSync(ENV_EXAMPLE_PATH, "utf-8");
const declaredVars = new Set<string>();
for (const line of exampleContent.split("\n")) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
  if (m) declaredVars.add(m[1]);
}

describe(".env.example completeness (#902)", () => {
  it("lists every env var referenced in src/ via process.env", () => {
    const missing = [...referencedVars].filter((v) => !declaredVars.has(v));
    expect(
      missing,
      `The following env vars are used in src/ but missing from .env.example:\n${missing.join("\n")}`
    ).toHaveLength(0);
  });

  it("!.env.example is present in .gitignore so the file can be committed", () => {
    const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf-8");
    expect(gitignore).toContain("!.env.example");
  });
});
