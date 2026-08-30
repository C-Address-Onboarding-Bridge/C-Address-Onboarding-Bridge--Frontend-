/**
 * Local (client-only) profile data for the connected wallet. (#325)
 *
 * There is no backend, so the one editable profile field — a display name — is
 * stored per address in `localStorage`, exactly like the avatar in
 * `src/lib/avatar.ts`. Connecting a different address shows that address's own
 * name rather than a shared one.
 *
 * Same two defences as the avatar store:
 *   1. **SSR** — `localStorage` does not exist on the server, so every accessor
 *      no-ops instead of throwing during prerender.
 *   2. **Untrusted storage** — localStorage is user-writable, so values are
 *      re-validated on read. The name is rendered as text (never as markup or a
 *      URL), so the risk is a broken layout rather than script execution;
 *      length and control characters are still enforced on the way out.
 */

/**
 * 32 characters. Long enough for a real name or handle, short enough to render
 * on one line next to the avatar without truncation at mobile widths.
 */
export const DISPLAY_NAME_MAX_LENGTH = 32;

const STORAGE_PREFIX = "profile:";
const NAME_SUFFIX = ":name";

/**
 * True when `value` holds a C0/C1 control character, a bidi mark, or a bidi
 * embedding override. A newline or an RTL override pasted into the field would
 * break the layout around it. Checked by code point rather than a regex so no
 * literal control characters have to live in this source file.
 */
function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
    if (code === 0x200e || code === 0x200f) return true;
    if (code >= 0x202a && code <= 0x202e) return true;
  }
  return false;
}

export type DisplayNameValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Storage key for an address. Exported so tests and docs can reference it. */
export function displayNameStorageKey(address: string): string {
  return `${STORAGE_PREFIX}${address}${NAME_SUFFIX}`;
}

/**
 * Validates and normalises a display name typed into the profile form.
 *
 * Returns the trimmed value on success so callers store exactly what was
 * validated — validating one string and persisting another is how a rule like
 * the length cap gets bypassed by trailing whitespace.
 */
export function validateDisplayName(raw: string): DisplayNameValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Enter a display name." };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Display name is too long — the limit is ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    };
  }
  if (hasControlChars(trimmed)) {
    return { ok: false, error: "Display name contains invalid characters." };
  }
  return { ok: true, value: trimmed };
}

/** True when `value` came out of storage in a shape that is safe to render. */
export function isRenderableDisplayName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Values written by saveDisplayName are always trimmed — an untrimmed value
  // came from outside this module (e.g. hand-edited localStorage).
  if (value !== value.trim()) return false;
  if (value.length === 0) return false;
  if (value.length > DISPLAY_NAME_MAX_LENGTH) return false;
  if (hasControlChars(value)) return false;
  return true;
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

/** Reads the stored display name for `address`, or null when absent/invalid. */
export function loadDisplayName(address: string | null | undefined): string | null {
  if (!address) return null;
  const store = storage();
  if (!store) return null;
  try {
    const value = store.getItem(displayNameStorageKey(address));
    if (!isRenderableDisplayName(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Persists `name` for `address`. Returns false when the name is invalid or the
 * write failed (most likely a quota error), so callers can surface a message
 * instead of silently losing the edit.
 */
export function saveDisplayName(
  address: string | null | undefined,
  name: string,
): boolean {
  if (!address) return false;
  const validation = validateDisplayName(name);
  if (!validation.ok) return false;
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(displayNameStorageKey(address), validation.value);
    return true;
  } catch {
    return false;
  }
}

/** Removes the stored display name for `address`. */
export function clearDisplayName(address: string | null | undefined): void {
  if (!address) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(displayNameStorageKey(address));
  } catch {
    // ignore
  }
}

/**
 * Short form of a Stellar address for display: `GABCDE…OPQRST`. Falls back to the
 * whole string when it is too short to shorten meaningfully.
 */
export function shortenAddress(address: string | null | undefined): string {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}
