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
      expect(addressBookStorageKey()).toBe("addressBook:recipients:mainnet");
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
    const valid = {
      id: "1",
      label: "Alice",
      address: VALID_ADDRESS,
      createdAt: 1700000000000,
      network: "mainnet" as const,
    };

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
      expect(isRenderableRecipient({ ...valid, network: undefined })).toBe(false);
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

    it("rejects an entry with an unknown network", () => {
      expect(isRenderableRecipient({ ...valid, network: "futurenet" })).toBe(false);
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

    it("drops an entry with a missing field instead of crashing", () => {
      const good = { id: "1", label: "Alice", address: VALID_ADDRESS, createdAt: 1700000000000, network: "mainnet" };
      const bad = { id: "2", label: "Bob", address: VALID_ADDRESS_2, network: "mainnet" };
      window.localStorage.setItem(addressBookStorageKey(), JSON.stringify([good, bad]));
      expect(loadAddressBook()).toHaveLength(1);
      expect(loadAddressBook()[0].label).toBe("Alice");
    });

    it("drops an entry with an invalid address instead of crashing", () => {
      const good = { id: "1", label: "Alice", address: VALID_ADDRESS, createdAt: 1700000000000, network: "mainnet" };
      const bad = { id: "2", label: "Bob", address: "not-an-address", createdAt: 1700000000000, network: "mainnet" };
      window.localStorage.setItem(addressBookStorageKey(), JSON.stringify([good, bad]));
      expect(loadAddressBook()).toHaveLength(1);
      expect(loadAddressBook()[0].label).toBe("Alice");
    });

    it("drops an entry with an over-long label instead of crashing", () => {
      const good = { id: "1", label: "Alice", address: VALID_ADDRESS, createdAt: 1700000000000, network: "mainnet" };
      const bad = {
        id: "2",
        label: "x".repeat(RECIPIENT_LABEL_MAX_LENGTH + 1),
        address: VALID_ADDRESS_2,
        createdAt: 1700000000000,
        network: "mainnet",
      };
      window.localStorage.setItem(addressBookStorageKey(), JSON.stringify([good, bad]));
      expect(loadAddressBook()).toHaveLength(1);
      expect(loadAddressBook()[0].label).toBe("Alice");
    });

    it("drops an entry with an unknown network instead of crashing", () => {
      const good = { id: "1", label: "Alice", address: VALID_ADDRESS, createdAt: 1700000000000, network: "mainnet" };
      const bad = { id: "2", label: "Bob", address: VALID_ADDRESS_2, createdAt: 1700000000000, network: "futurenet" };
      window.localStorage.setItem(addressBookStorageKey(), JSON.stringify([good, bad]));
      expect(loadAddressBook()).toHaveLength(1);
      expect(loadAddressBook()[0].label).toBe("Alice");
    });

    it("drops legacy pre-#693 entries that have no network field", () => {
      const legacy = { id: "1", label: "Alice", address: VALID_ADDRESS, createdAt: 1700000000000 };
      window.localStorage.setItem(addressBookStorageKey(), JSON.stringify([legacy]));
      expect(loadAddressBook()).toEqual([]);
    });
  });

  describe("exportAddressBook / importAddressBook", () => {
    it("round-trips through export and import", () => {
      saveRecipient("Alice", VALID_ADDRESS);
      const exported = exportAddressBook();
      expect(importAddressBook(exported)).toBe(true);
      expect(loadAddressBook().map((r) => r.label)).toEqual(["Alice"]);
    });

    it("rejects malformed import payloads without throwing", () => {
      expect(importAddressBook("{not json")).toBe(false);
      expect(importAddressBook(JSON.stringify({ not: "an array" }))).toBe(false);
    });
  });
});
