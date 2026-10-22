/**
 * #902: .env.example must document every environment variable read via
 * process.env in the src/ directory.
 *
 * This test greps src/ for process.env.VARIABLE_NAME references, then
 * checks that each variable name appears in .env.example. It fails if a
 * developer adds a new process.env.* call to the source without also
 * documenting it in .env.example.
 *
 * Excluded from the check:
 *   - NODE_ENV  — automatically set by Node.js / Next.js; not a user var
 *   - ANALYZE   — next.config.ts internal build flag, not a user var
 *   - ENFORCE_BUDGET — next.config.ts internal build flag, not a user var
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

/** Recursively collect all .ts/.tsx files under a directory. */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules and .next
      if (entry === "node_modules" || entry === ".next") continue;
      results.push(...collectSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

/** Internal/build-only vars that are not user-configurable. */
const EXCLUDED = new Set(["NODE_ENV", "ANALYZE", "ENFORCE_BUDGET"]);

describe("#902 — .env.example documents all process.env variables used in src/", () => {
  it("every process.env.VARNAME in src/ appears in .env.example", () => {
    // Collect all variable names used in src/
    const srcDir = join(ROOT, "src");
    const sourceFiles = collectSourceFiles(srcDir);

    const usedVars = new Set<string>();
    const envPattern = /process\.env\.([A-Z][A-Z0-9_]*)/g;

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8");
      let match: RegExpExecArray | null;
      while ((match = envPattern.exec(content)) !== null) {
        const varName = match[1];
        if (!EXCLUDED.has(varName)) {
          usedVars.add(varName);
        }
      }
    }

    // Read .env.example
    const envExample = readFileSync(join(ROOT, ".env.example"), "utf-8");

    const missing: string[] = [];
    for (const varName of usedVars) {
      if (!envExample.includes(varName)) {
        missing.push(varName);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `The following environment variables are used in src/ but are not documented in .env.example:\n` +
          missing.map((v) => `  - ${v}`).join("\n") +
          `\n\nAdd them to .env.example with a blank value and a comment describing what they do.`
      );
    }

    expect(missing).toHaveLength(0);
  });

  it(".env.example exists and is not empty", () => {
    const content = readFileSync(join(ROOT, ".env.example"), "utf-8");
    expect(content.trim().length).toBeGreaterThan(0);
  });
});
