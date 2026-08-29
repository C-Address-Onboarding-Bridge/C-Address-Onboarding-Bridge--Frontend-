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
  throw new Error('Not implemented: displayNameStorageKey');
}

/**
 * Validates and normalises a display name typed into the profile form.
 *
 * Returns the trimmed value on success so callers store exactly what was
 * validated — validating one string and persisting another is how a rule like
 * the length cap gets bypassed by trailing whitespace.
 */
export function validateDisplayName(raw: string): DisplayNameValidation {
  throw new Error('Not implemented: validateDisplayName');
}

/** True when `value` came out of storage in a shape that is safe to render. */
export function isRenderableDisplayName(value: unknown): value is string {
  throw new Error('Not implemented: isRenderableDisplayName');
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
  throw new Error('Not implemented: loadDisplayName');
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
  throw new Error('Not implemented: saveDisplayName');
}

/** Removes the stored display name for `address`. */
export function clearDisplayName(address: string | null | undefined): void {
  throw new Error('Not implemented: clearDisplayName');
}

/**
 * Short form of a Stellar address for display: `GABC…WXYZ`. Falls back to the
 * whole string when it is too short to shorten meaningfully.
 */
export function shortenAddress(address: string | null | undefined): string {
  throw new Error('Not implemented: shortenAddress');
}
