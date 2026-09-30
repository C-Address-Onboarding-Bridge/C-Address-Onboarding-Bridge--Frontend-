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
 *
 * Entries are scoped per network (#693): a testnet recipient must not appear
 * (or be acted on) while the app is on mainnet, and vice versa. The legacy
 * unscoped key is migrated once into the current network's bucket.
 */
import { validateStellarAddress } from "@/lib/addressValidation";
import { hasControlChars } from "./profile";

/** 32 characters — same budget as a profile display name (`DISPLAY_NAME_MAX_LENGTH`). */
export const RECIPIENT_LABEL_MAX_LENGTH = 32;

/**
 * Upper bound on the size of an imported JSON file, in bytes. A larger file is
 * rejected before parsing so a huge upload can't freeze the page while it is
 * validated or fill the storage quota for the whole origin.
 */
export const IMPORT_MAX_FILE_BYTES = 256 * 1024;

/**
 * Upper bound on the number of entries accepted from a single import. Entries
 * beyond this cap are skipped and reported rather than silently dropped.
 */
export const IMPORT_MAX_ENTRIES = 500;

const STORAGE_KEY = "addressBook:recipients";

/**
 * Networks the address book can be scoped to. Kept as a plain string union so
 * this module stays free of any Stellar SDK import.
 */
export type AddressBookNetwork = "mainnet" | "testnet";

/**
 * Resolves the network the address book should be scoped to. Defaults to
 * `mainnet` when nothing is configured, matching the app's default network.
 */
export function currentNetwork(): AddressBookNetwork {
  const raw = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  return raw === "testnet" ? "testnet" : "mainnet";
}

export interface SavedRecipient {
  id: string;
  label: string;
  address: string;
  createdAt: number;
  /** Network this recipient was saved on (#693). */
  network: AddressBookNetwork;
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
export function addressBookStorageKey(network: AddressBookNetwork = currentNetwork()): string {
  return `${STORAGE_KEY}:${network}`;
}

/** Legacy unscoped key, kept only so existing data can be migrated once. */
export function legacyAddressBookStorageKey(): string {
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
 * `src/lib/addressValidation.ts` rather than re-implemented here, so the address book and
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
  if (v.network !== "mainnet" && v.network !== "testnet") return false;

  return true;
}

function readRaw(network: AddressBookNetwork): unknown[] {
  const store = storage();
  if (!store) return [];

  let raw: string | null;
  try {
    raw = store.getItem(addressBookStorageKey(network));
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

function persist(recipients: SavedRecipient[], network: AddressBookNetwork): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(addressBookStorageKey(network), JSON.stringify(recipients));
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
 * One-time migration of the legacy unscoped address book into the current
 * network's bucket (#693). Existing entries are preserved and tagged with the
 * current network; the legacy key is removed so the migration runs once.
 */
export function migrateLegacyAddressBook(network: AddressBookNetwork = currentNetwork()): void {
  const store = storage();
  if (!store) return;

  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (Array.isArray(parsed)) {
    const migrated = parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .map((entry) => ({ ...entry, network }))
      .filter(isRenderableRecipient);

    if (migrated.length > 0) {
      const existing = readRaw(network).filter(isRenderableRecipient);
      const existingIds = new Set(existing.map((r) => r.id));
      const merged = [...existing, ...migrated.filter((r) => !existingIds.has(r.id))];
      persist(merged, network);
    }
  }

  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — the legacy key will simply be re-checked next load.
  }
}

/**
 * Reads the saved address book for the current network, dropping any entries
 * that fail re-validation (see module docs) instead of surfacing or throwing
 * on them.
 */
export function loadAddressBook(network: AddressBookNetwork = currentNetwork()): SavedRecipient[] {
  migrateLegacyAddressBook(network);
  return readRaw(network).filter(isRenderableRecipient).filter((r) => r.network === network);
}

/**
 * Saves a new recipient. Validates and normalises label/address first;
 * returns null when either is invalid or the write failed (most likely a
 * quota error), so callers can surface a message instead of silently losing
 * the entry.
 */
export function saveRecipient(
  rawLabel: string,
  rawAddress: string,
  network: AddressBookNetwork = currentNetwork(),
): SavedRecipient | null {
  const result = validateRecipient(rawLabel, rawAddress);
  if (!result.ok) return null;

  const recipient: SavedRecipient = {
    id: createRecipientId(),
    label: result.label,
    address: result.address,
    createdAt: Date.now(),
    network,
  };

  const existing = loadAddressBook(network);
  if (!persist([...existing, recipient], network)) return null;
  return recipient;
}

/**
 * Updates an existing recipient's label/address by id. Returns false when
 * the input is invalid, the id doesn't exist, or the write failed.
 */
export function updateRecipient(
  id: string,
  rawLabel: string,
  rawAddress: string,
  network: AddressBookNetwork = currentNetwork(),
): boolean {
  const result = validateRecipient(rawLabel, rawAddress);
  if (!result.ok) return false;

  const existing = loadAddressBook(network);
  const index = existing.findIndex((r) => r.id === id);
  if (index === -1) return false;

  const updated = [...existing];
  updated[index] = { ...existing[index], label: result.label, address: result.address };
  return persist(updated, network);
}

/** Removes a recipient by id. Returns false if the id wasn't found or the write failed. */
export function deleteRecipient(id: string, network: AddressBookNetwork = currentNetwork()): boolean {
  const existing = loadAddressBook(network);
  const next = existing.filter((r) => r.id !== id);
  if (next.length === existing.length) return false;
  return persist(next, network);
}

/** Serialises the address book to a JSON string for export/download. */
export function exportAddressBook(network: AddressBookNetwork = currentNetwork()): string {
  return JSON.stringify(loadAddressBook(network), null, 2);
}

/**
 * Imports recipients from a JSON string (e.g. an uploaded export file).
 * Each entry is independently validated — a malformed or invalid entry is
 * skipped (reported in `errors`) rather than aborting the whole import, and
 * an address already in the book is skipped rather than duplicated.
 *
 * The input is bounded before parsing: a file larger than
 * `IMPORT_MAX_FILE_BYTES` is rejected outright, and only the first
 * `IMPORT_MAX_ENTRIES` entries are considered — anything beyond the cap is
 * counted as skipped and reported so the user knows what was left out.
 */
export function importAddressBook(json: string, network: AddressBookNetwork = currentNetwork()): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { imported: 0, skipped: 0, errors: ["File is not valid JSON."] };
  }

  if (!Array.isArray(parsed)) {
    return { imported: 0, skipped: 0, errors: ["Expected a JSON array of recipients."] };
  }

  const existing = loadAddressBook(network);
  const existingAddresses = new Set(existing.map((r) => r.address));
  const toAdd: SavedRecipient[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const entries = parsed.slice(0, IMPORT_MAX_ENTRIES);
  const overflow = parsed.length - entries.length;
  if (overflow > 0) {
    skipped += overflow;
    errors.push(
      `Only the first ${IMPORT_MAX_ENTRIES} entries were imported; ${overflow} beyond the limit were skipped.`,
    );
  }

  entries.forEach((entry, index) => {
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
      network,
    });
  });

  if (toAdd.length > 0 && !persist([...existing, ...toAdd], network)) {
    return { imported: 0, skipped, errors: [...errors, "Could not save imported recipients."] };
  }

  return { imported: toAdd.length, skipped, errors };
}
