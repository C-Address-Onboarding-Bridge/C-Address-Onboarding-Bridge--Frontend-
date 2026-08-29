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
 * 32 code points. Long enough for a real name or handle, short enough to render
 * on one line next to the avatar without truncation at mobile widths.
 *
 * The cap is measured in **Unicode code points** (i.e. `[...value].length`),
 * not UTF-16 code units (`String.prototype.length`). This means emoji and other
 * astral-plane characters each count as 1, matching what the user sees on
 * screen. (#458)
 */
export const DISPLAY_NAME_MAX_LENGTH = 32;

const STORAGE_PREFIX = "profile:";
const NAME_SUFFIX = ":name";

/**
 * Count the number of Unicode code points in a string.
 *
 * JavaScript's `String.prototype.length` returns the number of UTF-16 code
 * units, which double-counts any character outside the Basic Multilingual Plane
 * (e.g. emoji, mathematical symbols). Spreading the string into an array
 * iterates by code point instead, giving the count a user would expect. (#458)
 */
function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * True when `value` holds a C0/C1 control character, a bidi mark, or a bidi
 * embedding override. A newline or an RTL override pasted into the field would
 * break the layout around it. Checked by code point rather than a regex so no
 * literal control characters have to live in this source file.
 *
 * Exported so other per-address text stores (e.g. `src/lib/addressBook.ts`
 * recipient labels, #466) can reuse the same check instead of re-deriving it.
 */
export function hasControlChars(value: string): boolean {
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
 *
 * Length is measured in **Unicode code points** so that emoji and other
 * astral-plane characters count as 1 against the cap, matching what the user
 * sees on screen. (#458)
 */
export function validateDisplayName(raw: string): DisplayNameValidation {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "Enter a display name." };
  }

  // Count code points, not UTF-16 code units, so emoji count as 1. (#458)
  const len = codePointLength(trimmed);
  if (len > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Display name is too long — the limit is ${DISPLAY_NAME_MAX_LENGTH} characters (yours is ${len}).`,
    };
  }

  if (hasControlChars(trimmed)) {
    return {
      ok: false,
      error: "Display name contains invalid characters.",
    };
  }

  return { ok: true, value: trimmed };
}

/** True when `value` came out of storage in a shape that is safe to render. */
export function isRenderableDisplayName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Must be trimmed (saveDisplayName always stores the trimmed form).
  if (value !== value.trim()) return false;
  // Re-run the same validation used at write time.
  return validateDisplayName(value).ok;
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

  let raw: string | null;
  try {
    raw = store.getItem(displayNameStorageKey(address));
  } catch {
    return null;
  }

  if (raw === null) return null;
  return isRenderableDisplayName(raw) ? raw : null;
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
  const store = storage();
  if (!store) return false;

  const validation = validateDisplayName(name);
  if (!validation.ok) return false;

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
    // Swallow — nothing useful to do if removal fails.
  }
}

/**
 * Short form of a Stellar address for display: `GABC…WXYZ`. Falls back to the
 * whole string when it is too short to shorten meaningfully.
 *
 * Stellar addresses are Base32-encoded and contain only ASCII characters, so
 * `String.prototype.slice` is safe here without any code-point awareness.
 */
export function shortenAddress(address: string | null | undefined): string {
  if (!address) return "";
  // Keep at least 12 characters (6 + 6) before eliding; shorter strings are
  // returned as-is so the display never shows "GA…" with nothing after.
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}
