import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  RECIPIENT_LABEL_MAX_LENGTH,
  addressBookStorageKey,
  deleteRecipient,
  exportAddressBook,
  importAddressBook,
  isRenderableRecipient,
  loadAddressBook,
  saveRecipient,
  updateRecipient,
  validateRecipient,
} from "../addressBook";

/**
 * Unit tests for the address book store (#466).
 *
 * Mirrors `src/lib/__tests__/profile.test.ts`'s structure: the interesting
 * cases are values that arrive from user-writable `localStorage` (or an
 * imported JSON file) in a shape the UI would render badly, and the failure
 * paths where storage is unavailable or full. SSR behaviour is covered
 * separately in `addressBook.ssr.test.ts`, which runs in a real
 * window-less environment.
 */

const VALID_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
// A second, genuinely checksum-valid address — hand-writing one is not
// possible since the checksum is a real CRC16 over the payload bytes.
const VALID_ADDRESS_2 = Keypair.random().publicKey();

describe("address book store (#466)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("addressBookStorageKey", () => {
    it("returns a stable, namespaced key", () => {
      expect(addressBookStorageKey()).toBe("addressBook:recipients");
    });
  });

  describe("validateRecipient", () => {
    it("accepts a valid label and address, trimmed", () => {
      const result = validateRecipient("  Alice  ", `  ${VALID_ADDRESS}  `);
      expect(result).toEqual({ ok: true, label: "Alice", address: VALID_ADDRESS });
    });

    it("rejects an empty or whitespace-only label", () => {
      expect(validateRecipient("", VALID_ADDRESS).ok).toBe(false);
      expect(validateRecipient("   ", VALID_ADDRESS).ok).toBe(false);
    });

    it("rejects a label over the length limit", () => {
      const result = validateRecipient("x".repeat(RECIPIENT_LABEL_MAX_LENGTH + 1), VALID_ADDRESS);
      expect(result.ok).toBe(false);
    });

    it("accepts a label exactly at the length limit", () => {
      expect(validateRecipient("x".repeat(RECIPIENT_LABEL_MAX_LENGTH), VALID_ADDRESS).ok).toBe(true);
    });

    it("rejects a label with control characters", () => {
      expect(validateRecipient("Ada\nLovelace", VALID_ADDRESS).ok).toBe(false);
    });

    it("reuses AddressForm's address validation — rejects an invalid address", () => {
      const result = validateRecipient("Alice", "not-an-address");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toContain("start with G");
    });

    it("reuses AddressForm's address validation — flags a C-address with its specific message", () => {
      const cAddress = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
      const result = validateRecipient("Alice", cAddress);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toContain("C-address");
    });

    it("rejects an empty address", () => {
      expect(validateRecipient("Alice", "").ok).toBe(false);
    });
  });

  describe("isRenderableRecipient", () => {
    const valid = { id: "1", label: "Alice", address: VALID_ADDRESS, createdAt: 1700000000000 };

    it("accepts a well-formed recipient", () => {
      expect(isRenderableRecipient(valid)).toBe(true);
    });

    it("rejects non-objects", () => {
      expect(isRenderableRecipient(null)).toBe(false);
      expect(isRenderableRecipient(undefined)).toBe(false);
      expect(isRenderableRecipient("Alice")).toBe(false);
      expect(isRenderableRecipient(42)).toBe(false);
    });

    it("rejects an entry missing a field", () => {
      expect(isRenderableRecipient({ ...valid, id: undefined })).toBe(false);
      expect(isRenderableRecipient({ ...valid, label: undefined })).toBe(false);
      expect(isRenderableRecipient({ ...valid, address: undefined })).toBe(false);
      expect(isRenderableRecipient({ ...valid, createdAt: undefined })).toBe(false);
    });

    it("rejects an entry with an invalid address", () => {
      expect(isRenderableRecipient({ ...valid, address: "not-an-address" })).toBe(false);
    });

    it("rejects an entry with an over-long or control-character label", () => {
      expect(isRenderableRecipient({ ...valid, label: "x".repeat(RECIPIENT_LABEL_MAX_LENGTH + 1) })).toBe(false);
      expect(isRenderableRecipient({ ...valid, label: "Ada\nLovelace" })).toBe(false);
    });

    it("rejects a non-finite createdAt", () => {
      expect(isRenderableRecipient({ ...valid, createdAt: Number.NaN })).toBe(false);
      expect(isRenderableRecipient({ ...valid, createdAt: "1700000000000" })).toBe(false);
    });
  });

  describe("saveRecipient / loadAddressBook", () => {
    it("round-trips a valid recipient", () => {
      const saved = saveRecipient("Alice", VALID_ADDRESS);
      expect(saved).not.toBeNull();
      expect(loadAddressBook()).toEqual([saved]);
    });

    it("assigns a unique id and a createdAt timestamp", () => {
      const a = saveRecipient("Alice", VALID_ADDRESS);
      const b = saveRecipient("Bob", VALID_ADDRESS_2);
      expect(a?.id).not.toBe(b?.id);
      expect(typeof a?.createdAt).toBe("number");
    });

    it("refuses to save an invalid recipient", () => {
      expect(saveRecipient("", VALID_ADDRESS)).toBeNull();
      expect(saveRecipient("Alice", "not-an-address")).toBeNull();
      expect(loadAddressBook()).toEqual([]);
    });

    it("accumulates multiple recipients", () => {
      saveRecipient("Alice", VALID_ADDRESS);
      saveRecipient("Bob", VALID_ADDRESS_2);
      expect(loadAddressBook().map((r) => r.label)).toEqual(["Alice", "Bob"]);
    });

    it("reports failure instead of throwing when the write is rejected", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      expect(saveRecipient("Alice", VALID_ADDRESS)).toBeNull();
    });
  });

  describe("updateRecipient", () => {
    it("updates label and address by id", () => {
      const saved = saveRecipient("Alice", VALID_ADDRESS)!;
      expect(updateRecipient(saved.id, "Alice Updated", VALID_ADDRESS_2)).toBe(true);

      const [updated] = loadAddressBook();
      expect(updated).toMatchObject({ id: saved.id, label: "Alice Updated", address: VALID_ADDRESS_2 });
    });

    it("returns false for an unknown id", () => {
      expect(updateRecipient("does-not-exist", "Alice", VALID_ADDRESS)).toBe(false);
    });

    it("returns false and leaves the entry unchanged when the new data is invalid", () => {
      const saved = saveRecipient("Alice", VALID_ADDRESS)!;
      expect(updateRecipient(saved.id, "", VALID_ADDRESS)).toBe(false);
      expect(loadAddressBook()[0]).toEqual(saved);
    });
  });

  describe("deleteRecipient", () => {
    it("removes a recipient by id", () => {
      const saved = saveRecipient("Alice", VALID_ADDRESS)!;
      expect(deleteRecipient(saved.id)).toBe(true);
      expect(loadAddressBook()).toEqual([]);
    });

    it("leaves other recipients untouched", () => {
      const a = saveRecipient("Alice", VALID_ADDRESS)!;
      const b = saveRecipient("Bob", VALID_ADDRESS_2)!;
      deleteRecipient(a.id);
      expect(loadAddressBook()).toEqual([b]);
    });

    it("returns false for an unknown id", () => {
      expect(deleteRecipient("does-not-exist")).toBe(false);
    });
  });

  describe("re-validation on read — corrupted or malformed storage", () => {
    it("returns [] for invalid JSON", () => {
      window.localStorage.setItem(addressBookStorageKey(), "{not valid json");
      expect(() => loadAddressBook()).not.toThrow();
      expect(loadAddressBook()).toEqual([]);
    });

    it("returns [] when the stored value is valid JSON but not an array", () => {
      window.localStorage.setItem(addressBookStorageKey(), JSON.stringify({ not: "an array" }));
      expect(loadAddressBook()).toEqual([]);
    });

    it("drops an entry with an invalid address embedded in otherwise-valid JSON", () => {
      window.localStorage.setItem(
        addressBookStorageKey(),
        JSON.stringify([
          { id: "1", label: "Good", address: VALID_ADDRESS, createdAt: 1 },
          { id: "2", label: "Bad", address: "not-an-address", createdAt: 2 },
        ])
      );

      const loaded = loadAddressBook();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].label).toBe("Good");
    });

    it("drops an entry with a missing field instead of crashing", () => {
      window.localStorage.setItem(
        addressBookStorageKey(),
        JSON.stringify([
          { id: "1", label: "Good", address: VALID_ADDRESS, createdAt: 1 },
          { id: "2", address: VALID_ADDRESS_2, createdAt: 2 }, // missing label
        ])
      );

      expect(() => loadAddressBook()).not.toThrow();
      const loaded = loadAddressBook();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].label).toBe("Good");
    });

    it("drops a non-object entry within the array", () => {
      window.localStorage.setItem(
        addressBookStorageKey(),
        JSON.stringify(["just a string", null, 42, { id: "1", label: "Good", address: VALID_ADDRESS, createdAt: 1 }])
      );

      expect(loadAddressBook()).toHaveLength(1);
    });

    it("returns null instead of throwing when the read is rejected", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      expect(() => loadAddressBook()).not.toThrow();
      expect(loadAddressBook()).toEqual([]);
    });
  });

  describe("exportAddressBook / importAddressBook", () => {
    it("exports the current address book as pretty JSON", () => {
      saveRecipient("Alice", VALID_ADDRESS);
      const json = exportAddressBook();
      expect(JSON.parse(json)).toEqual(loadAddressBook());
    });

    it("exports an empty array when there is nothing saved", () => {
      expect(JSON.parse(exportAddressBook())).toEqual([]);
    });

    it("round-trips export -> import into an empty book", () => {
      saveRecipient("Alice", VALID_ADDRESS);
      saveRecipient("Bob", VALID_ADDRESS_2);
      const json = exportAddressBook();
      window.localStorage.clear();

      const result = importAddressBook(json);

      expect(result).toEqual({ imported: 2, skipped: 0, errors: [] });
      expect(loadAddressBook().map((r) => r.label)).toEqual(["Alice", "Bob"]);
    });

    it("handles malformed JSON gracefully instead of throwing", () => {
      expect(() => importAddressBook("{not valid")).not.toThrow();
      const result = importAddressBook("{not valid");
      expect(result.imported).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects a JSON payload that isn't an array", () => {
      const result = importAddressBook(JSON.stringify({ label: "Alice", address: VALID_ADDRESS }));
      expect(result).toEqual({
        imported: 0,
        skipped: 0,
        errors: ["Expected a JSON array of recipients."],
      });
    });

    it("imports valid entries and skips invalid ones, reporting why", () => {
      const payload = JSON.stringify([
        { label: "Alice", address: VALID_ADDRESS },
        { label: "Bad", address: "not-an-address" },
        { label: "", address: VALID_ADDRESS_2 },
      ]);

      const result = importAddressBook(payload);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(loadAddressBook().map((r) => r.label)).toEqual(["Alice"]);
    });

    it("skips an entry whose address is already saved, without duplicating it", () => {
      saveRecipient("Alice", VALID_ADDRESS);
      const result = importAddressBook(JSON.stringify([{ label: "Alice Again", address: VALID_ADDRESS }]));

      expect(result).toEqual({ imported: 0, skipped: 1, errors: [] });
      expect(loadAddressBook()).toHaveLength(1);
    });

    it("does not crash importing entries with the wrong field types", () => {
      const payload = JSON.stringify([
        { label: 42, address: VALID_ADDRESS },
        { label: "Alice", address: ["not", "a", "string"] },
        null,
        "just a string",
      ]);

      expect(() => importAddressBook(payload)).not.toThrow();
      const result = importAddressBook(payload);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(4);
    });
  });
});
