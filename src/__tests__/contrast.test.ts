import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Automated WCAG 2.x contrast audit for the --text-muted design token.
 *
 * --text-muted is used pervasively for meaningful secondary content (balances,
 * transaction statuses, form hints), so it must clear WCAG AA (4.5:1 for normal
 * text) against every surface it renders over — including the translucent tint
 * overlays (e.g. bg-[var(--error)]/10) that blend into lighter backgrounds.
 *
 * This test parses the real token values from globals.css for both the light
 * (:root) and dark (:root.dark) themes, so lowering the token's contrast below
 * AA — or darkening/lightening a surface under it — fails CI.
 */

const AA_NORMAL = 4.5;

const cssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app/globals.css",
);
const css = readFileSync(cssPath, "utf8");

// ---------------------------------------------------------------------------
// Token parsing — handles both the :root and :root.dark blocks
// ---------------------------------------------------------------------------

/**
 * Extract all CSS custom properties from a named block (selector).
 * Returns a map of { varName -> hexValue } for all `--name: #rrggbb` lines
 * found within the matching selector block.
 */
function parseBlock(selector: string): Map<string, string> {
  // Match everything between the selector's opening brace and its matching
  // closing brace. A simple regex works here because the blocks are flat.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "s");
  const blockMatch = css.match(blockRe);
  if (!blockMatch) throw new Error(`Selector "${selector}" not found in globals.css`);

  const block = blockMatch[1];
  const varRe = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g;
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(block)) !== null) {
    map.set(m[1], m[2]);
  }
  return map;
}

const lightTokens = parseBlock(":root");
const darkTokens = parseBlock(":root.dark");

function getToken(map: Map<string, string>, name: string): string {
  const val = map.get(name);
  if (!val) throw new Error(`Token --${name} not found in block`);
  return val;
}

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: RGB): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Alpha-composite `fg` at `alpha` over opaque `bg` (CSS "source-over").
function composite(fg: RGB, alpha: number, bg: RGB): RGB {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

// ---------------------------------------------------------------------------
// Dark theme test surfaces
// ---------------------------------------------------------------------------

const darkMuted = hexToRgb(getToken(darkTokens, "text-muted"));
const darkBackground = hexToRgb(getToken(darkTokens, "background"));
const darkSurface = hexToRgb(getToken(darkTokens, "surface"));
const darkSurface2 = hexToRgb(getToken(darkTokens, "surface-2"));

const darkSolidSurfaces: Record<string, RGB> = {
  "--background (dark)": darkBackground,
  "--surface (dark)": darkSurface,
  "--surface-2 (dark)": darkSurface2,
};

const darkTintOverlays: { label: string; bg: RGB }[] = (
  [
    ["primary", 0.05, darkSurface],
    ["primary", 0.1, darkSurface],
    ["secondary", 0.1, darkSurface],
    ["accent", 0.1, darkSurface],
    ["success", 0.1, darkSurface],
    ["error", 0.1, darkSurface],
  ] as const
).map(([name, alpha, base]) => ({
  label: `dark: ${name}/${alpha * 100}% on surface`,
  bg: composite(hexToRgb(getToken(darkTokens, name)), alpha, base),
}));

// ---------------------------------------------------------------------------
// Light theme test surfaces
// ---------------------------------------------------------------------------

const lightMuted = hexToRgb(getToken(lightTokens, "text-muted"));
const lightBackground = hexToRgb(getToken(lightTokens, "background"));
const lightSurface = hexToRgb(getToken(lightTokens, "surface"));
const lightSurface2 = hexToRgb(getToken(lightTokens, "surface-2"));

const lightSolidSurfaces: Record<string, RGB> = {
  "--background (light)": lightBackground,
  "--surface (light)": lightSurface,
  "--surface-2 (light)": lightSurface2,
};

const lightTintOverlays: { label: string; bg: RGB }[] = (
  [
    ["primary", 0.05, lightSurface],
    ["primary", 0.1, lightSurface],
    ["secondary", 0.1, lightSurface],
    ["accent", 0.1, lightSurface],
    ["success", 0.1, lightSurface],
    ["error", 0.1, lightSurface],
  ] as const
).map(([name, alpha, base]) => ({
  label: `light: ${name}/${alpha * 100}% on surface`,
  bg: composite(hexToRgb(getToken(lightTokens, name)), alpha, base),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("--text-muted WCAG AA contrast — dark theme", () => {
  it.each(Object.entries(darkSolidSurfaces))(
    "meets AA over %s",
    (_label, bg) => {
      expect(contrastRatio(darkMuted, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(darkTintOverlays)("meets AA over $label", ({ bg }) => {
    expect(contrastRatio(darkMuted, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("--text-muted WCAG AA contrast — light theme", () => {
  it.each(Object.entries(lightSolidSurfaces))(
    "meets AA over %s",
    (_label, bg) => {
      expect(contrastRatio(lightMuted, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(lightTintOverlays)("meets AA over $label", ({ bg }) => {
    expect(contrastRatio(lightMuted, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
