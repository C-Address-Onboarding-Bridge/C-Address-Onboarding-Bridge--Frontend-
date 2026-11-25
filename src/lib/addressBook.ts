/**
- Local (client-only) address book of saved recipients (#466).
 *
- Entries are scoped per network (#693, #951): derived from the wallet's
- `StellarNetwork` (`"PUBLIC"` / `"TESTNET"`) or `APP_NETWORK` by default.
 */
import { validateStellarAddress } from "@/lib/addressValidation";
import { APP_NETWORK, type StellarNetwork } from "@/lib/types";
import { hasControlChars } from "./profile";

/** 32 characters — same budget as a profile display name (`DISPLAY_NAME_MAX_LENGTH`). */
export const RECIPIENT_LABEL_MAX_LENGTH = 32;

/**
- Upper bound on the size of an imported JSON file, in bytes.
 */
export const IMPORT_MAX_FILE_BYTES = 256 * 1024;

/**
- Upper bound on the number of entries accepted from a single import.
 */
export const IMPORT_MAX_ENTRIES = 500;

const STORAGE_KEY = "addressBook:recipients";

/**
- Networks the address book can be scoped to in storage.
 */
export type AddressBookNetwork = "mainnet" | "testnet";

/** Accepted network inputs: either the app's `StellarNetwork` or normalized `AddressBookNetwork`. */
export type AddressBookNetworkInput = AddressBookNetwork | StellarNetwork;

/**
- Maps `StellarNetwork` (`"PUBLIC" | "TESTNET"`) or `AddressBookNetwork`
- onto the canonical `"mainnet" | "testnet"` scope used in `SavedRecipient`. (#951)
 */
export function toAddressBookNetwork(network: AddressBookNetworkInput): AddressBookNetwork {
  if (network === "PUBLIC" || network === "mainnet") return "mainnet";
  return "testnet";
}

/**
- Resolves the network the address book should be scoped to when no wallet
- network is explicitly supplied. Reads `NEXT_PUBLIC_STELLAR_NETWORK` with the
- exact same `"PUBLIC"` vs default `"TESTNET"` rule as `APP_NETWORK`. (#951)
 */
export function currentNetwork(): AddressBookNetwork {
  const configured: StellarNetwork =
    process.env.NEXT_PUBLIC_STELLAR_NETWORK === "PUBLIC" ? "PUBLIC" : APP_NETWORK;
  return toAddressBookNetwork(configured);
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
export function addressBookStorageKey(
  network: AddressBookNetworkInput = currentNetwork()
): string {
  return `${STORAGE_KEY}:${toAddressBookNetwork(network)}`;
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
    return null;
  }
}

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

export function migrateLegacyAddressBook(
  network: AddressBookNetworkInput = currentNetwork()
): void {
  const scoped = toAddressBookNetwork(network);
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
      .map((entry) => ({ ...entry, network: scoped }))
      .filter(isRenderableRecipient);

    if (migrated.length > 0) {
      const existing = readRaw(scoped).filter(isRenderableRecipient);
      const existingIds = new Set(existing.map((r) => r.id));
      const merged = [...existing, ...migrated.filter((r) => !existingIds.has(r.id))];
      persist(merged, scoped);
    }
  }

  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — the legacy key will simply be re-checked next load.
  }
}

export function loadAddressBook(
  network: AddressBookNetworkInput = currentNetwork()
): SavedRecipient[] {
  const scoped = toAddressBookNetwork(network);
  migrateLegacyAddressBook(scoped);
  return readRaw(scoped).filter(isRenderableRecipient).filter((r) => r.network === scoped);
}

export function saveRecipient(
  rawLabel: string,
  rawAddress: string,
  network: AddressBookNetworkInput = currentNetwork()
): SavedRecipient | null {
  const scoped = toAddressBookNetwork(network);
  const validated = validateRecipient(rawLabel, rawAddress);
  if (!validated.ok) return null;

  const entry: SavedRecipient = {
    id: createRecipientId(),
    label: validated.label,
    address: validated.address,
    createdAt: Date.now(),
    network: scoped,
  };

  const existing = loadAddressBook(scoped);
  if (!persist([...existing, entry], scoped)) return null;
  return entry;
}

export function updateRecipient(
  id: string,
  rawLabel: string,
  rawAddress: string,
  network: AddressBookNetworkInput = currentNetwork()
): boolean {
  const scoped = toAddressBookNetwork(network);
  const validated = validateRecipient(rawLabel, rawAddress);
  if (!validated.ok) return false;

  const existing = loadAddressBook(scoped);
  const index = existing.findIndex((r) => r.id === id);
  if (index === -1) return false;

  const updated = [...existing];
  updated[index] = {
    ...updated[index],
    label: validated.label,
    address: validated.address,
  };
  return persist(updated, scoped);
}

export function deleteRecipient(
  id: string,
  network: AddressBookNetworkInput = currentNetwork()
): boolean {
  const scoped = toAddressBookNetwork(network);
  const existing = loadAddressBook(scoped);
  const next = existing.filter((r) => r.id !== id);
  if (next.length === existing.length) return false;
  return persist(next, scoped);
}

export function exportAddressBook(
  network: AddressBookNetworkInput = currentNetwork()
): string {
  return JSON.stringify(loadAddressBook(network), null, 2);
}

export function importAddressBook(
  rawJson: string,
  network: AddressBookNetworkInput = currentNetwork()
): boolean {
  const scoped = toAddressBookNetwork(network);
  if (typeof rawJson !== "string" || rawJson.length > IMPORT_MAX_FILE_BYTES) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;

  const existing = loadAddressBook(scoped);
  const existingIds = new Set(existing.map((r) => r.id));
  const accepted: SavedRecipient[] = [];

  for (const rawEntry of parsed.slice(0, IMPORT_MAX_ENTRIES)) {
    if (typeof rawEntry !== "object" || rawEntry === null) continue;
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.label !== "string" || typeof entry.address !== "string") continue;
    const validated = validateRecipient(entry.label, entry.address);
    if (!validated.ok) continue;

    const id =
      typeof entry.id === "string" && entry.id && !existingIds.has(entry.id)
        ? entry.id
        : createRecipientId();
    const createdAt =
      typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
        ? entry.createdAt
        : Date.now();

    const candidate: SavedRecipient = {
      id,
      label: validated.label,
      address: validated.address,
      createdAt,
      network: scoped,
    };
    if (isRenderableRecipient(candidate)) {
      accepted.push(candidate);
      existingIds.add(id);
    }
  }

  return persist([...existing, ...accepted], scoped);
}