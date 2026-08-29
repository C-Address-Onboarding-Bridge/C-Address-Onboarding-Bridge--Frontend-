/**
 * Local (client-only) address book of saved recipients (#466).
 *
 * There is no backend, so saved recipients live in `localStorage` as a single
 * JSON array. Unlike `src/lib/profile.ts`/`src/lib/avatar.ts` — which store
 * one value *about* the connected wallet's own address — recipients are
 * addresses the user sends *to*, so this is one shared list rather than a
 * value keyed per address.
 *
 * Same two defences as the profile/avatar stores:
 *   1. **SSR** — `localStorage` does not exist on the server, so every
 *      accessor no-ops instead of throwing during prerender.
 *   2. **Untrusted storage** — localStorage is user-writable, and the JSON
 *      import feature accepts a file from disk, so every entry is
 *      re-validated on read; a corrupted, hand-edited, or malicious entry is
 *      dropped instead of breaking the whole list or being rendered as-is.
 */
import { validateStellarAddress } from "@/components/AddressForm";
import { hasControlChars } from "./profile";

/** 32 characters — same budget as a profile display name (`DISPLAY_NAME_MAX_LENGTH`). */
export const RECIPIENT_LABEL_MAX_LENGTH = 32;

const STORAGE_KEY = "addressBook:recipients";

export interface SavedRecipient {
  id: string;
  label: string;
  address: string;
  createdAt: number;
}

export type RecipientValidation =
  | { ok: true; label: string; address: string }
  | { ok: false; error: string };

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Storage key for the address book. Exported so tests and docs can reference it. */
export function addressBookStorageKey(): string {
  return STORAGE_KEY;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Access itself throws in some privacy modes.
    return null;
  }
}

/**
 * Validates and normalises a label + address pair before it is saved.
 * Address validation is delegated to `validateStellarAddress` from
 * AddressForm.tsx rather than re-implemented here, so the address book and
 * the funding form always agree on what counts as a valid address.
 */
export function validateRecipient(rawLabel: string, rawAddress: string): RecipientValidation {
  const label = rawLabel.trim();
  if (!label) {
    return { ok: false, error: "Label is required" };
  }
  if (label.length > RECIPIENT_LABEL_MAX_LENGTH) {
    return { ok: false, error: `Label must be ${RECIPIENT_LABEL_MAX_LENGTH} characters or fewer` };
  }
  if (hasControlChars(label)) {
    return { ok: false, error: "Label cannot contain line breaks or control characters" };
  }

  const addressResult = validateStellarAddress(rawAddress);
  if (!addressResult.valid) {
    return { ok: false, error: addressResult.error ?? "Invalid address" };
  }

  return { ok: true, label, address: rawAddress.trim() };
}

/** True when `value` is a saved recipient in the exact shape this module writes. */
export function isRenderableRecipient(value: unknown): value is SavedRecipient {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string" || !v.id) return false;
  if (typeof v.label !== "string" || !v.label || v.label.length > RECIPIENT_LABEL_MAX_LENGTH) return false;
  if (hasControlChars(v.label)) return false;
  if (typeof v.address !== "string" || !validateStellarAddress(v.address).valid) return false;
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) return false;

  return true;
}

function readRaw(): unknown[] {
  const store = storage();
  if (!store) return [];

  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(recipients: SavedRecipient[]): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(recipients));
    return true;
  } catch {
    return false;
  }
}

function createRecipientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Reads the saved address book, dropping any entries that fail
 * re-validation (see module docs) instead of surfacing or throwing on them.
 */
export function loadAddressBook(): SavedRecipient[] {
  return readRaw().filter(isRenderableRecipient);
}

/**
 * Saves a new recipient. Validates and normalises label/address first;
 * returns null when either is invalid or the write failed (most likely a
 * quota error), so callers can surface a message instead of silently losing
 * the entry.
 */
export function saveRecipient(rawLabel: string, rawAddress: string): SavedRecipient | null {
  const result = validateRecipient(rawLabel, rawAddress);
  if (!result.ok) return null;

  const recipient: SavedRecipient = {
    id: createRecipientId(),
    label: result.label,
    address: result.address,
    createdAt: Date.now(),
  };

  const existing = loadAddressBook();
  if (!persist([...existing, recipient])) return null;
  return recipient;
}

/**
 * Updates an existing recipient's label/address by id. Returns false when
 * the input is invalid, the id doesn't exist, or the write failed.
 */
export function updateRecipient(id: string, rawLabel: string, rawAddress: string): boolean {
  const result = validateRecipient(rawLabel, rawAddress);
  if (!result.ok) return false;

  const existing = loadAddressBook();
  const index = existing.findIndex((r) => r.id === id);
  if (index === -1) return false;

  const updated = [...existing];
  updated[index] = { ...existing[index], label: result.label, address: result.address };
  return persist(updated);
}

/** Removes a recipient by id. Returns false if the id wasn't found or the write failed. */
export function deleteRecipient(id: string): boolean {
  const existing = loadAddressBook();
  const next = existing.filter((r) => r.id !== id);
  if (next.length === existing.length) return false;
  return persist(next);
}

/** Serialises the address book to a JSON string for export/download. */
export function exportAddressBook(): string {
  return JSON.stringify(loadAddressBook(), null, 2);
}

/**
 * Imports recipients from a JSON string (e.g. an uploaded export file).
 * Each entry is independently validated — a malformed or invalid entry is
 * skipped (reported in `errors`) rather than aborting the whole import, and
 * an address already in the book is skipped rather than duplicated.
 */
export function importAddressBook(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { imported: 0, skipped: 0, errors: ["File is not valid JSON."] };
  }

  if (!Array.isArray(parsed)) {
    return { imported: 0, skipped: 0, errors: ["Expected a JSON array of recipients."] };
  }

  const existing = loadAddressBook();
  const existingAddresses = new Set(existing.map((r) => r.address));
  const toAdd: SavedRecipient[] = [];
  const errors: string[] = [];
  let skipped = 0;

  parsed.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      errors.push(`Entry ${index + 1}: not an object.`);
      skipped++;
      return;
    }
    const e = entry as Record<string, unknown>;
    const label = typeof e.label === "string" ? e.label : "";
    const address = typeof e.address === "string" ? e.address : "";
    const result = validateRecipient(label, address);
    if (!result.ok) {
      errors.push(`Entry ${index + 1}: ${result.error}`);
      skipped++;
      return;
    }
    if (existingAddresses.has(result.address)) {
      skipped++;
      return;
    }
    existingAddresses.add(result.address);
    toAdd.push({
      id: createRecipientId(),
      label: result.label,
      address: result.address,
      createdAt: Date.now(),
    });
  });

  if (toAdd.length > 0 && !persist([...existing, ...toAdd])) {
    return {
      imported: 0,
      skipped: skipped + toAdd.length,
      errors: [...errors, "Couldn't save — browser storage may be full."],
    };
  }

  return { imported: toAdd.length, skipped, errors };
}
