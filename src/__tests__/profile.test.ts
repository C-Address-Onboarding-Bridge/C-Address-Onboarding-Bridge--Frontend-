// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameStorageKey,
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
