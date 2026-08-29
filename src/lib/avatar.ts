/**
 * Local (client-only) avatar storage for the connected wallet.
 *
 * There is no backend to upload to, so an avatar is stored as a data URL in
 * `localStorage` keyed on the wallet address. That keeps the feature entirely
 * self-contained and means a user who connects a different address sees that
 * address's own avatar rather than a shared one.
 *
 * Everything here is defensive about two things:
 *   1. **SSR** — `localStorage` does not exist on the server, so every accessor
 *      no-ops instead of throwing during prerender.
 *   2. **Untrusted storage** — the stored string ends up in an `<img src>`, and
 *      localStorage is user-writable. Values are re-validated on read so only
 *      `data:image/...;base64,...` URLs are ever rendered (never `javascript:`
 *      or a remote URL). The app's CSP allows `img-src 'self' data:`.
 */

/** Image types accepted by the picker and by validation. */
export const ACCEPTED_AVATAR_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/**
 * 512 KB. Kept small on purpose: the encoded data URL is ~33% larger than the
 * file and localStorage quota is typically 5 MB per origin, shared with feature
 * flags and the wallet session.
 */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** `accept` attribute value for the file input. */
export const AVATAR_ACCEPT_ATTR = ACCEPTED_AVATAR_TYPES.join(",");

const STORAGE_PREFIX = "avatar:";

/** Only base64 data URLs for the accepted image types are renderable. */
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

export type AvatarValidation = { ok: true } | { ok: false; error: string };

/** Human-readable size for error messages, e.g. "512 KB" or "1.4 MB". */
export function formatBytes(bytes: number): string {
  throw new Error('Not implemented: formatBytes');
}

/**
 * Validates a picked file before it is read. Takes the structural subset of
 * `File` it needs so it can be unit-tested without a DOM `File`.
 */
export function validateAvatarFile(file: Pick<File, "type" | "size">): AvatarValidation {
  throw new Error('Not implemented: validateAvatarFile');
}

/** True when `value` is a base64 image data URL that is safe to render. */
export function isRenderableAvatar(value: unknown): value is string {
  throw new Error('Not implemented: isRenderableAvatar');
}

/** Storage key for an address. Exported so tests and docs can reference it. */
export function avatarStorageKey(address: string): string {
  throw new Error('Not implemented: avatarStorageKey');
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

/** Reads the stored avatar for `address`, or null when absent/invalid. */
export function loadAvatar(address: string | null | undefined): string | null {
  throw new Error('Not implemented: loadAvatar');
}

/**
 * Persists `dataUrl` for `address`. Returns false when the value is not a safe
 * data URL or the write failed (most likely a quota error), so callers can
 * surface a message instead of silently losing the image.
 */
export function saveAvatar(address: string | null | undefined, dataUrl: string): boolean {
  throw new Error('Not implemented: saveAvatar');
}

/** Removes the stored avatar for `address`. */
export function removeAvatar(address: string | null | undefined): void {
  if (!address) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(avatarStorageKey(address));
  } catch {
    // Ignore storage failures on best-effort cleanup.
  }
}

/**
 * Two-character fallback shown when no avatar is set. Stellar addresses are
 * base32 so the leading characters ("GA", "CB", …) are stable and readable.
 */
export function avatarInitials(address: string | null | undefined): string {
  if (!address) return "?";
  return address.slice(0, 2).toUpperCase();
}
