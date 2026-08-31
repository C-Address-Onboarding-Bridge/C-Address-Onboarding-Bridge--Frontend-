// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  deleteRecipient,
  exportAddressBook,
  importAddressBook,
  loadAddressBook,
  saveRecipient,
  updateRecipient,
} from "../addressBook";

/**
 * SSR-path tests for the address book store (#466).
 *
 * Run in vitest's `node` environment, where `window`/`localStorage` are
 * genuinely undefined globals rather than jsdom stand-ins — the same
 * condition the store's accessors see during Next.js server rendering. Every
 * accessor must no-op instead of throwing here; see `src/lib/profile.ts` and
 * `src/lib/avatar.ts` for the same guard on the established stores.
 */
describe("address book store — SSR (no window)", () => {
  it("has no window in this environment", () => {
    expect(typeof window).toBe("undefined");
  });

  it("loadAddressBook returns an empty list instead of throwing", () => {
    expect(() => loadAddressBook()).not.toThrow();
    expect(loadAddressBook()).toEqual([]);
  });

  it("saveRecipient returns null instead of throwing", () => {
    expect(() => saveRecipient("Alice", "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")).not.toThrow();
    expect(saveRecipient("Alice", "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")).toBeNull();
  });

  it("updateRecipient returns false instead of throwing", () => {
    expect(() => updateRecipient("some-id", "Alice", "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")).not.toThrow();
    expect(updateRecipient("some-id", "Alice", "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")).toBe(false);
  });

  it("deleteRecipient returns false instead of throwing", () => {
    expect(() => deleteRecipient("some-id")).not.toThrow();
    expect(deleteRecipient("some-id")).toBe(false);
  });

  it("exportAddressBook returns an empty array instead of throwing", () => {
    expect(() => exportAddressBook()).not.toThrow();
    expect(exportAddressBook()).toBe("[]");
  });

  it("importAddressBook reports the write failure instead of throwing", () => {
    const validEntry = JSON.stringify([
      { label: "Alice", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" },
    ]);
    expect(() => importAddressBook(validEntry)).not.toThrow();
    const result = importAddressBook(validEntry);
    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
