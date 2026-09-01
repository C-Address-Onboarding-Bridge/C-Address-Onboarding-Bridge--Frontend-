import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NEVER_CACHE_ORIGINS } from "@/lib/serviceWorker";

/**
 * Automated security audit. (#348)
 *
 * The repo has no E2E harness, so the flows an E2E security pass would walk —
 * outbound links, injection sinks, transport security, the CSP and header set,
 * and now the service worker's cache boundary — are audited statically here
 * instead. Every rule below is a regression guard: it fails the build when a
 * new commit reintroduces a pattern that has to stay out of this codebase.
 *
 * Static analysis is not a substitute for a real E2E security suite; it is the
 * layer that runs on every commit in under a second.
 */

const repoRoot = path.resolve(__dirname, "../..");
const srcRoot = path.resolve(__dirname, "..");

/** Application source only — test files themselves are excluded so audit rules don't match their own patterns. */
const SCANNED_DIRS = ["app", "components", "contexts", "hooks", "lib"] as const;

interface SourceFile {
  /** Repo-relative path, used in failure messages. */
  path: string;
  contents: string;
}

function collect(dir: string, acc: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Colocated suites (src/lib/__tests__, src/components/__tests__) live
      // inside the scanned dirs. They have to be skipped here or the audit
      // rules match the very patterns the tests write down as counterexamples.
      if (entry.name === "__tests__") continue;
      collect(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push({ path: path.relative(repoRoot, full), contents: readFileSync(full, "utf8") });
    }
  }
  return acc;
}

const sourceFiles: SourceFile[] = SCANNED_DIRS.flatMap((dir) =>
  collect(path.join(srcRoot, dir)),
);

const nextConfig = readFileSync(path.join(repoRoot, "next.config.ts"), "utf8");
const swSource = readFileSync(path.join(repoRoot, "public/sw.js"), "utf8");

/** Reports `file:line` for every line matching `pattern`, so failures point at the offender. */
function findMatches(pattern: RegExp, files: SourceFile[] = sourceFiles): string[] {
  const hits: string[] = [];
  for (const file of files) {
    file.contents.split("\n").forEach((line, index) => {
      if (pattern.test(line)) hits.push(`${file.path}:${index + 1}: ${line.trim()}`);
      pattern.lastIndex = 0;
    });
  }
  return hits;
}

describe("audit scope", () => {
  it("scans the application source", () => {
    // Guards the audit itself: a broken glob would silently make every rule pass.
    expect(sourceFiles.length).toBeGreaterThan(10);
    expect(sourceFiles.some((f) => f.path.endsWith("src/lib/stellar.ts"))).toBe(true);
    expect(sourceFiles.every((f) => !f.path.includes("__tests__"))).toBe(true);
  });
});

describe("injection sinks", () => {
  it("uses no dangerouslySetInnerHTML", () => {
    expect(findMatches(/dangerouslySetInnerHTML/)).toEqual([]);
  });

  it("assigns no innerHTML / outerHTML directly", () => {
    expect(findMatches(/\.(inner|outer)HTML\s*=/)).toEqual([]);
  });

  it("uses no eval or Function constructor", () => {
    expect(findMatches(/(^|[^.\w])eval\s*\(/)).toEqual([]);
    expect(findMatches(/new\s+Function\s*\(/)).toEqual([]);
  });

  it("uses no document.write", () => {
    expect(findMatches(/document\.write\s*\(/)).toEqual([]);
  });

  it("passes no string to setTimeout / setInterval", () => {
    expect(findMatches(/set(Timeout|Interval)\s*\(\s*["'`]/)).toEqual([]);
  });
});

describe("outbound links and transport", () => {
  it("gives every target=\"_blank\" link a safe rel", () => {
    // Reverse tabnabbing: without rel="noopener" the opened page gets a
    // window.opener handle back into this origin's tab.
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      // Arrow functions are neutralised first so `() =>` inside an attribute
      // cannot terminate the tag match early. Matching the whole opening tag
      // (rather than a window of surrounding lines) keeps single-line anchors
      // from borrowing a neighbouring anchor's rel attribute.
      const normalized = file.contents.replace(/=>/g, "==");

      for (const tag of normalized.matchAll(/<a\s[^>]*>/g)) {
        if (!/target=["']_blank["']/.test(tag[0])) continue;
        const rel = tag[0].match(/rel=["']([^"']*)["']/)?.[1] ?? "";
        const tokens = rel.toLowerCase().split(/\s+/);
        if (!tokens.includes("noopener") && !tokens.includes("noreferrer")) {
          const line = normalized.slice(0, tag.index).split("\n").length;
          offenders.push(`${file.path}:${line}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("hardcodes no plaintext http:// endpoints", () => {
    const offenders = findMatches(/["'`]http:\/\/(?!localhost|127\.0\.0\.1)/);
    expect(offenders).toEqual([]);
  });

  it("points every Stellar endpoint at https", () => {
    const offenders = findMatches(/["'`](?!https:)[a-z]+:\/\/[^"'`]*stellar\.org/);
    expect(offenders).toEqual([]);
  });
});

describe("secret material", () => {
  it("contains no hardcoded Stellar secret seed", () => {
    // Stellar secret seeds are 56-char base32 strings starting with S.
    expect(findMatches(/["'`]S[A-Z2-7]{55}["'`]/)).toEqual([]);
  });

  it("contains no assigned api key / secret / password / token literal", () => {
    const offenders = findMatches(
      /\b(api[_-]?key|secret[_-]?key|client[_-]?secret|private[_-]?key|password)\b\s*[:=]\s*["'][^"']+["']/i,
    );
    expect(offenders).toEqual([]);
  });

  it("exposes no server-only env var to the client bundle", () => {
    // Anything not prefixed NEXT_PUBLIC_ is server-only; reading it from a
    // "use client" module means it silently resolves to undefined at runtime,
    // and reading a real secret there would inline it into the bundle.
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      if (!/^\s*["']use client["']/m.test(file.contents)) continue;
      for (const match of file.contents.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1];
        if (name !== "NODE_ENV" && !name.startsWith("NEXT_PUBLIC_")) {
          offenders.push(`${file.path}: process.env.${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("security headers (next.config.ts)", () => {
  it("sends a Content-Security-Policy header", () => {
    expect(nextConfig).toMatch(/Content-Security-Policy/);
  });

  it.each([
    ["default-src 'self'", /default-src 'self'/],
    ["frame-ancestors 'none'", /frame-ancestors 'none'/],
    ["object-src 'none'", /object-src 'none'/],
    ["base-uri 'self'", /base-uri 'self'/],
    ["form-action 'self'", /form-action 'self'/],
    ["upgrade-insecure-requests", /upgrade-insecure-requests/],
  ])("CSP declares %s", (_label, pattern) => {
    expect(nextConfig).toMatch(pattern);
  });

  it("never allows a wildcard source in the CSP", () => {
    const csp = nextConfig.match(/const cspHeader = `([\s\S]*?)`/)?.[1];
    expect(csp, "cspHeader template literal not found in next.config.ts").toBeTruthy();
    expect(csp).not.toMatch(/\*/);
    expect(csp).not.toMatch(/https:(?!\/\/)/);
  });

  it("only permits 'unsafe-eval' in development", () => {
    const csp = nextConfig.match(/const cspHeader = `([\s\S]*?)`/)![1];
    const unsafeEval = csp.match(/.*unsafe-eval.*/)?.[0];
    if (unsafeEval) {
      expect(unsafeEval).toMatch(/isDev/);
    }
  });

  it("restricts connect-src to self and known Stellar endpoints", () => {
    const connectSrc = nextConfig.match(/connect-src([\s\S]*?);/)?.[1] ?? "";
    expect(connectSrc).toMatch(/'self'/);
    for (const origin of connectSrc.match(/https:\/\/[^\s]+/g) ?? []) {
      expect(origin).toMatch(/\.stellar\.org$/);
    }
  });

  it.each([
    ["X-Frame-Options", /"X-Frame-Options"[\s\S]{0,60}"DENY"/],
    ["Referrer-Policy", /"Referrer-Policy"[\s\S]{0,80}"strict-origin-when-cross-origin"/],
    ["Permissions-Policy", /"Permissions-Policy"[\s\S]{0,120}camera=\(\)/],
  ])("sends %s", (_label, pattern) => {
    expect(nextConfig).toMatch(pattern);
  });

  it("applies the header set to every route except the embeddable widget", () => {
    // #558: the widget is designed to be framed by third-party host pages,
    // so it deliberately doesn't get frame-ancestors 'none' / X-Frame-Options
    // DENY. This asserts the carve-out is exactly "/widget" and nothing
    // broader, so a future edit can't widen it by accident.
    expect(nextConfig).toMatch(/source:\s*"\/\(\(\?!widget\)\.\*\)"/);
  });
});

describe("embeddable widget headers (#558)", () => {
  it("gives the widget route its own header set, not the strict default", () => {
    expect(nextConfig).toMatch(/source:\s*"\/widget\/:path\*"/);
    expect(nextConfig).toMatch(/headers:\s*widgetSecurityHeaders/);
  });

  it("relaxes frame-ancestors for the widget instead of dropping CSP outright", () => {
    const widgetHeaders = nextConfig.match(
      /const widgetSecurityHeaders = \[([\s\S]*?)\n\];/,
    )?.[1];
    expect(widgetHeaders, "widgetSecurityHeaders array not found in next.config.ts").toBeTruthy();
    // Checks the .replace() call rewrites the shared cspHeader's
    // frame-ancestors, not that the string "frame-ancestors 'none'" is
    // absent from this block's source text — it necessarily appears once,
    // as the pattern the .replace() call matches against.
    expect(widgetHeaders).toMatch(/\.replace\(\/frame-ancestors 'none';\/, "frame-ancestors \*;"\)/);
  });

  it("does not send X-Frame-Options on the widget route (no permissive value exists for it)", () => {
    const widgetHeaders = nextConfig.match(
      /const widgetSecurityHeaders = \[([\s\S]*?)\n\];/,
    )?.[1];
    expect(widgetHeaders).not.toMatch(/X-Frame-Options/);
  });

  it("keeps Referrer-Policy and Permissions-Policy on the widget route", () => {
    const widgetHeaders = nextConfig.match(
      /const widgetSecurityHeaders = \[([\s\S]*?)\n\];/,
    )?.[1];
    expect(widgetHeaders).toMatch(/"Referrer-Policy"/);
    expect(widgetHeaders).toMatch(/"Permissions-Policy"/);
  });
});

describe("service worker cache boundary", () => {
  it("never caches Stellar network responses", () => {
    // A cached balance or sequence number would make the app sign transactions
    // against stale consensus state.
    for (const origin of NEVER_CACHE_ORIGINS) {
      expect(swSource).toContain(origin);
    }
    expect(swSource).toMatch(/NEVER_CACHE_ORIGINS\.includes\(url\.origin\)/);
  });

  it("never caches non-GET requests or /api routes", () => {
    expect(swSource).toMatch(/request\.method\s*!==\s*"GET"/);
    expect(swSource).toMatch(/pathname\.startsWith\("\/api\/"\)/);
  });

  it("only handles same-origin requests", () => {
    expect(swSource).toMatch(/origin\s*!==\s*self\.location\.origin/);
  });

  it("never stores opaque or error responses", () => {
    expect(swSource).toMatch(/response\.ok\s*!==\s*true/);
    expect(swSource).toMatch(/response\.type === "basic"/);
  });

  it("loads no external script into the worker", () => {
    expect(swSource).not.toMatch(/importScripts/);
  });
});
