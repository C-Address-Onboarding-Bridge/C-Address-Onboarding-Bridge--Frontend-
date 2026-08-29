// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearDisplayName,
  displayNameStorageKey,
  saveDisplayName,
  shortenAddress,
} from "@/lib/profile";

const ADDRESS_A = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
const ADDRESS_B = "CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

beforeEach(() => {
  window.localStorage.clear();
});

describe("clearDisplayName (#527)", () => {
  it("removes the stored name for the given address", () => {
    saveDisplayName(ADDRESS_A, "Alice");
    expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS_A))).toBe("Alice");

    clearDisplayName(ADDRESS_A);

    expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS_A))).toBeNull();
  });

  it("only clears the given address, leaving other addresses untouched", () => {
    saveDisplayName(ADDRESS_A, "Alice");
    saveDisplayName(ADDRESS_B, "Bob");

    clearDisplayName(ADDRESS_A);

    expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS_A))).toBeNull();
    expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS_B))).toBe("Bob");
  });

  it("is a no-op for a null/undefined address (does not throw)", () => {
    expect(() => clearDisplayName(null)).not.toThrow();
    expect(() => clearDisplayName(undefined)).not.toThrow();
  });

  it("is a no-op when nothing was ever stored for the address", () => {
    expect(() => clearDisplayName(ADDRESS_A)).not.toThrow();
    expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS_A))).toBeNull();
  });
});

describe("shortenAddress (#528)", () => {
  it("keeps the first 6 and last 6 characters, joined by an ellipsis", () => {
    const result = shortenAddress(ADDRESS_A);
    expect(result).toBe(`${ADDRESS_A.slice(0, 6)}…${ADDRESS_A.slice(-6)}`);
    expect(result.startsWith(ADDRESS_A.slice(0, 6))).toBe(true);
    expect(result.endsWith(ADDRESS_A.slice(-6))).toBe(true);
  });

  it("returns strings of 12 characters or fewer unchanged", () => {
    expect(shortenAddress("123456789012")).toBe("123456789012"); // exactly 12
    expect(shortenAddress("short")).toBe("short");
    expect(shortenAddress("")).toBe("");
  });

  it("shortens strings of 13 characters or more", () => {
    const address = "1234567890123"; // 13 chars
    expect(shortenAddress(address)).toBe("123456…890123");
  });

  it("returns an empty string for null/undefined input", () => {
    expect(shortenAddress(null)).toBe("");
    expect(shortenAddress(undefined)).toBe("");
  });
});
