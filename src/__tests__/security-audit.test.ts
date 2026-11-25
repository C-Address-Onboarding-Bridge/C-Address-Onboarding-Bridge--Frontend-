import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NEVER_CACHE_ORIGINS } from "@/lib/serviceWorker";
import {
  buildCsp,
  buildWidgetCsp,
  buildConnectSrcOrigins,
} from "@/proxy";
import nextConfigModule from "../../next.config";

/**
 * TODO(next-bounty): the tests marked `.skip` in this file assert behaviour that
 * was never finished (or was lost in a bad merge) during the first bounty
 * programme. They are skipped -- not deleted -- so the next programme has an
 * exact worklist: un-skip one, make it pass, repeat. Nothing here was rewritten
 * to fit the current implementation.
 */

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
      // POSIX separators on every OS, so path checks like
      // endsWith("src/lib/stellar.ts") also hold on Windows.
      const relative = path.relative(repoRoot, full).split(path.sep).join("/");
      acc.push({ path: relative, contents: readFileSync(full, "utf8") });
    }
  }
  return acc;
}

const sourceFiles: SourceFile[] = SCANNED_DIRS.flatMap((dir) =>
  collect(path.join(srcRoot, dir)),
);

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

/** Parses a CSP string into directive -> sources, so assertions read the policy, not its source text. */
function parseCsp(csp: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) directives.set(name, sources);
  }
  return directives;
}

const testEnv: Record<string, string | undefined> = {
  NODE_ENV: "production",
  NEXT_PUBLIC_API_URL: "https://api.example.test",
  NEXT_PUBLIC_TRANSACTION_STATUS_URL: "https://status.example.test",
};

describe("Content-Security-Policy (src/proxy.ts)", () => {
  it.each([
    ["default-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["upgrade-insecure-requests", []],
  ])("declares %s", (directive, sources) => {
    const csp = parseCsp(buildCsp(testEnv));
    expect(csp.has(directive)).toBe(true);
    expect(csp.get(directive)).toEqual(sources);
  });

  it("never allows a wildcard source in the CSP", () => {
    const csp = buildCsp(testEnv);
    expect(csp).not.toMatch(/\*/);
    expect(csp).not.toMatch(/https:(?!\/\/)/);
  });

  it("only permits 'unsafe-eval' in development", () => {
    expect(buildCsp({ ...testEnv, NODE_ENV: "production" })).not.toMatch(/unsafe-eval/);
    expect(buildCsp({ ...testEnv, NODE_ENV: "development" })).toMatch(/unsafe-eval/);
  });

  it("stamps the nonce on script-src when one is supplied", () => {
    const csp = parseCsp(buildCsp(testEnv, "abc123"));
    expect(csp.get("script-src")).toContain("'nonce-abc123'");
    expect(csp.get("script-src")).toContain("'strict-dynamic'");
  });

  it("restricts connect-src to self and known Stellar endpoints", () => {
    const origins = buildConnectSrcOrigins(testEnv);
    expect(origins).toContain("'self'");
    expect(origins).toContain("https://api.example.test");
    expect(origins).toContain("https://status.example.test");
    for (const origin of origins.filter((o) => o !== "'self'")) {
      expect(origin).toMatch(/^https:\/\//);
    }
    expect(parseCsp(buildCsp(testEnv)).get("connect-src")).toEqual(origins);
  });

  it.each([
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"],
  ])("sends %s", (key, value) => {
    const headers = nextConfigModule.headers;
    expect(headers).toBeTypeOf("function");
    return headers!().then((entries) => {
      const strict = entries.find((entry) => entry.source === "/((?!widget(?:/|$)).*)");
      expect(strict, "strict header entry not found").toBeTruthy();
      expect(strict!.headers).toContainEqual({ key, value });
    });
  });

  it("sends X-Content-Type-Options: nosniff on the widget route too", async () => {
    const entries = await nextConfigModule.headers!();
    const widgetEntries = entries.filter((entry) => entry.source.startsWith("/widget"));
    expect(widgetEntries).toHaveLength(2);
    for (const entry of widgetEntries) {
      expect(entry.headers).toContainEqual({
        key: "X-Content-Type-Options",
        value: "nosniff",
      });
    }
  });

  it("sends Strict-Transport-Security in production only", async () => {
    const original = process.env.NODE_ENV;
    const hsts = {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    };
    try {
      process.env.NODE_ENV = "production";
      const prodEntries = await nextConfigModule.headers!();
      expect(prodEntries.length).toBeGreaterThan(0);
      for (const entry of prodEntries) {
        expect(entry.headers).toContainEqual(hsts);
      }

      process.env.NODE_ENV = "development";
      const devEntries = await nextConfigModule.headers!();
      for (const entry of devEntries) {
        expect(entry.headers).not.toContainEqual(
          expect.objectContaining({ key: "Strict-Transport-Security" }),
        );
      }
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("applies the header set to every route except the embeddable widget", async () => {
    // #558: the widget is designed to be framed by third-party host pages,
    // so it deliberately doesn't get frame-ancestors 'none' / X-Frame-Options
    // DENY. The carve-out is scoped exactly (not a "starts with widget"
    // prefix) so /widgets and /widget-preview keep the strict headers.
    const entries = await nextConfigModule.headers!();
    const strict = entries.find((entry) => entry.source === "/((?!widget(?:/|$)).*)");
    expect(strict, "strict header entry not found").toBeTruthy();
    expect(strict!.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });

    const widgetSources = entries
      .filter((entry) => entry.headers !== strict!.headers)
      .map((entry) => entry.source);
    expect(widgetSources).toEqual(["/widget", "/widget/:path*"]);
  });
});

describe("embeddable widget headers (#558)", () => {
  it("gives the widget route its own header set, not the strict default", async () => {
    const entries = await nextConfigModule.headers!();
    const widgetEntries = entries.filter((entry) => entry.source.startsWith("/widget"));
    expect(widgetEntries.map((entry) => entry.source)).toEqual([
      "/widget",
      "/widget/:path*",
    ]);
    for (const entry of widgetEntries) {
      expect(entry.headers).not.toContainEqual(
        expect.objectContaining({ key: "X-Frame-Options" }),
      );
    }
  });

  it("relaxes frame-ancestors for the widget instead of dropping CSP outright", () => {
    const csp = parseCsp(buildWidgetCsp(testEnv));
    expect(csp.has("frame-ancestors")).toBe(true);
    expect(csp.get("frame-ancestors")).not.toEqual(["'none'"]);
    // Everything else is still the strict policy.
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
  });

  it("yields frame-ancestors 'none' with no allowlist and exactly the listed origins otherwise", () => {
    expect(parseCsp(buildWidgetCsp(testEnv)).get("frame-ancestors")).toEqual(["'none'"]);

    const allowlisted = parseCsp(
      buildWidgetCsp({
        ...testEnv,
        NEXT_PUBLIC_WIDGET_ALLOWED_ORIGINS:
          "https://host-a.example, https://host-b.example",
      }),
    ).get("frame-ancestors");
    expect(allowlisted).toEqual(["https://host-a.example", "https://host-b.example"]);
  });

  it("does not send X-Frame-Options on the widget route (no permissive value exists for it)", async () => {
    const entries = await nextConfigModule.headers!();
    const widgetEntries = entries.filter((entry) => entry.source.startsWith("/widget"));
    expect(widgetEntries.length).toBeGreaterThan(0);
    for (const entry of widgetEntries) {
      expect(entry.headers.map((header) => header.key)).not.toContain("X-Frame-Options");
    }
  });

  it("keeps Referrer-Policy and Permissions-Policy on the widget route", async () => {
    const entries = await nextConfigModule.headers!();
    const widgetEntries = entries.filter((entry) => entry.source.startsWith("/widget"));
    expect(widgetEntries.length).toBeGreaterThan(0);
    for (const entry of widgetEntries) {
      const keys = entry.headers.map((header) => header.key);
      expect(keys).toContain("Referrer-Policy");
      expect(keys).toContain("Permissions-Policy");
    }
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
