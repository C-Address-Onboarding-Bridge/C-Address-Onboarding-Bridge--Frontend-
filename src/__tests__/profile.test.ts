// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { clearDisplayName, displayNameStorageKey, saveDisplayName } from "@/lib/profile";

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
