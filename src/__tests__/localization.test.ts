import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { APP_LOCALE, EMPTY_VALUE, formatTransactionDate } from "@/lib/format";

/** A fixed instant: 14 March 2026, 15:04 UTC. */
const TIMESTAMP = Date.UTC(2026, 2, 14, 15, 4, 0);

describe("formatTransactionDate", () => {
  it("formats a timestamp using the app locale, not the host locale", () => {
    // en-US renders month-first with no zero padding. Asserting the exact
    // string is only safe because the locale is pinned in lib/format.ts — this
    // assertion is what would break if a call site went back to the ambient
    // locale.
    expect(formatTransactionDate(TIMESTAMP)).toBe("3/14/2026");
  });

  it("is unaffected by the ambient locale of the process", () => {
    // Intl honours LANG/LC_ALL only at startup, so this asserts the property
    // that matters directly: the output must equal an explicit en-US format
    // and must differ from what a European locale would produce.
    const explicit = new Date(TIMESTAMP).toLocaleDateString("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    expect(formatTransactionDate(TIMESTAMP)).toBe(explicit);
    expect(formatTransactionDate(TIMESTAMP)).not.toBe(
      new Date(TIMESTAMP).toLocaleDateString("de-DE")
    );
  });

  it("returns the same string on repeated calls (stable across renders)", () => {
    expect(formatTransactionDate(TIMESTAMP)).toBe(formatTransactionDate(TIMESTAMP));
  });

  it("collapses a NaN timestamp to the empty placeholder instead of 'Invalid Date'", () => {
    // lib/stellar.ts produces NaN when Horizon returns a malformed created_at.
    expect(formatTransactionDate(NaN)).toBe(EMPTY_VALUE);
    expect(formatTransactionDate(NaN)).not.toContain("Invalid");
  });

  it("collapses non-finite timestamps to the empty placeholder", () => {
    expect(formatTransactionDate(Infinity)).toBe(EMPTY_VALUE);
    expect(formatTransactionDate(-Infinity)).toBe(EMPTY_VALUE);
  });

  it("formats the unix epoch rather than treating 0 as missing", () => {
    // 0 is falsy but a legitimate instant; a truthiness guard would wrongly
    // blank it out.
    expect(formatTransactionDate(0)).not.toBe(EMPTY_VALUE);
  });
});

describe("locale declaration", () => {
  const read = (relative: string) =>
    fs.readFileSync(path.resolve(__dirname, relative), "utf-8");

  it("APP_LOCALE agrees with the lang attribute on <html>", () => {
    const layout = read("../app/layout.tsx");
    const lang = layout.match(/<html\s+lang="([^"]+)"/)?.[1];

    expect(lang).toBeDefined();
    // "en-US" must remain a specialisation of the declared "en".
    expect(APP_LOCALE.split("-")[0]).toBe(lang!.split("-")[0]);
  });

  it("no component formats dates with an implicit locale", () => {
    // Guards the regression this module exists to prevent: a bare
    // toLocaleDateString()/toLocaleTimeString()/toLocaleString() call inherits
    // the host locale and desynchronises server and client output.
    const componentDir = path.resolve(__dirname, "../components");
    const appDir = path.resolve(__dirname, "../app");

    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });

    const offenders = [...walk(componentDir), ...walk(appDir)].filter((file) =>
      /toLocale(?:Date|Time)?String\(\s*\)/.test(fs.readFileSync(file, "utf-8"))
    );

    expect(offenders).toEqual([]);
  });
});
