// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameStorageKey,
  isRenderableDisplayName,
  loadDisplayName,
  validateDisplayName,
} from "@/lib/profile";

const ADDRESS_A = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

describe("validateDisplayName (#523)", () => {
  it("rejects an empty or whitespace-only name", () => {
    expect(validateDisplayName("").ok).toBe(false);
    expect(validateDisplayName("   ").ok).toBe(false);
  });

  it("trims surrounding whitespace and returns the trimmed value", () => {
    const result = validateDisplayName("  Alice  ");
    expect(result).toEqual({ ok: true, value: "Alice" });
  });

  it("accepts a name exactly at the code point cap", () => {
    const name = "a".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name });
  });

  it("rejects a name over the code point cap", () => {
    const name = "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    expect(validateDisplayName(name).ok).toBe(false);
  });

  it("counts astral-plane emoji as a single code point each (#458)", () => {
    // Each emoji below is a single Unicode code point but 2 UTF-16 units.
    const name = "\u{1F600}".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(validateDisplayName(name).ok).toBe(true);
    expect(validateDisplayName(name + "\u{1F600}").ok).toBe(false);
  });

  it("rejects control characters and bidi overrides", () => {
    expect(validateDisplayName("Alice\nBob").ok).toBe(false);
    expect(validateDisplayName("Alice‮cve.exe").ok).toBe(false);
  });
});

describe("isRenderableDisplayName (#524)", () => {
  it("rejects non-string values from tampered storage", () => {
    expect(isRenderableDisplayName(null)).toBe(false);
    expect(isRenderableDisplayName(undefined)).toBe(false);
    expect(isRenderableDisplayName(42)).toBe(false);
    expect(isRenderableDisplayName({ name: "Alice" })).toBe(false);
  });

  it("rejects a value with leading/trailing whitespace (not pre-trimmed)", () => {
    expect(isRenderableDisplayName(" Alice")).toBe(false);
    expect(isRenderableDisplayName("Alice ")).toBe(false);
  });

  it("rejects a value that fails validateDisplayName (e.g. control chars, too long)", () => {
    expect(isRenderableDisplayName("Alice\nBob")).toBe(false);
    expect(isRenderableDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(false);
    expect(isRenderableDisplayName("")).toBe(false);
  });

  it("accepts a trimmed, valid string and narrows the type", () => {
    const value: unknown = "Alice";
    expect(isRenderableDisplayName(value)).toBe(true);
    if (isRenderableDisplayName(value)) {
      // Type guard narrows `unknown` to `string`.
      expect(value.toUpperCase()).toBe("ALICE");
    }
  });
});

describe("loadDisplayName (#525)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when address is missing", () => {
    expect(loadDisplayName(null)).toBeNull();
    expect(loadDisplayName(undefined)).toBeNull();
    expect(loadDisplayName("")).toBeNull();
  });

  it("returns null when nothing is stored for the address", () => {
    expect(loadDisplayName(ADDRESS_A)).toBeNull();
  });

  it("returns the stored name when present and valid", () => {
    localStorage.setItem(displayNameStorageKey(ADDRESS_A), "Alice");
    expect(loadDisplayName(ADDRESS_A)).toBe("Alice");
  });

  it("returns null instead of throwing when stored value is tampered/invalid", () => {
    // Not trimmed — fails isRenderableDisplayName even though it's a string.
    localStorage.setItem(displayNameStorageKey(ADDRESS_A), " Alice ");
    expect(loadDisplayName(ADDRESS_A)).toBeNull();
  });

  it("scopes names per address", () => {
    localStorage.setItem(displayNameStorageKey(ADDRESS_A), "Alice");
    expect(loadDisplayName("CDIFFERENTADDRESS")).toBeNull();
  });
});
