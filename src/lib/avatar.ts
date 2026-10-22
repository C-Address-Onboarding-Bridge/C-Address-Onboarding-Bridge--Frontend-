/**
 * Local (client-only) avatar storage for the connected wallet.
 *
 * There is no backend to upload to, so an avatar is stored as a data URL in
 * `localStorage` keyed on the wallet address. That keeps the feature entirely
 * self-contained and means a user who connects a different address sees that
 * address's own avatar rather than a shared one.
 *
 * localStorage is about 5 MB per origin, shared with sessions, the address
 * book, schedules and notifications, so images are downscaled to
 * {@link AVATAR_MAX_DIMENSION} pixels before saving (`downscaleAvatar`): a
 * 512 KB photo becomes a few KB instead of ~700 KB of base64. When storage is
 * full anyway, `saveAvatarResult` says so, so the UI can tell the user. (#761)
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

/**
 * Longest side, in pixels, of a stored avatar: twice the largest size it is
 * shown at (80 px on the profile page), so it stays sharp on high-density
 * screens. (#761)
 */
export const AVATAR_MAX_DIMENSION = 160;

/**
 * Longest data URL `saveAvatar` will store: a base64-encoded image of
 * {@link AVATAR_MAX_BYTES} plus its prefix. Anything longer is not one the
 * picker could have produced.
 */
export const AVATAR_MAX_STORED_LENGTH = Math.ceil(AVATAR_MAX_BYTES / 3) * 4 + 64;

/** `accept` attribute value for the file input. */
export const AVATAR_ACCEPT_ATTR = ACCEPTED_AVATAR_TYPES.join(",");

const STORAGE_PREFIX = "avatar:";

/** Only base64 data URLs for the accepted image types are renderable. */
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

export type AvatarValidation = { ok: true } | { ok: false; error: string };

/** Human-readable size for error messages, e.g. "512 B", "512 KB" or "1.5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * Validates a picked file before it is read. Takes the structural subset of
 * `File` it needs so it can be unit-tested without a DOM `File`.
 */
export function validateAvatarFile(file: Pick<File, "type" | "size">): AvatarValidation {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type as (typeof ACCEPTED_AVATAR_TYPES)[number])) {
    return { ok: false, error: "Unsupported file type — choose a PNG, JPEG, WebP or GIF image." };
  }
  if (file.size <= 0) {
    return { ok: false, error: "The selected image is empty." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: `Image is too large — the limit is ${formatBytes(AVATAR_MAX_BYTES)} (yours is ${formatBytes(file.size)}).`,
    };
  }
  return { ok: true };
}

/** True when `value` is a base64 image data URL that is safe to render. */
export function isRenderableAvatar(value: unknown): value is string {
  return typeof value === "string" && DATA_URL_PATTERN.test(value);
}

/** Storage key for an address. Exported so tests and docs can reference it. */
export function avatarStorageKey(address: string): string {
  return `${STORAGE_PREFIX}${address}`;
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
  if (!address) return null;
  const store = storage();
  if (!store) return null;
  try {
    const value = store.getItem(avatarStorageKey(address));
    return isRenderableAvatar(value) ? value : null;
  } catch {
    return null;
  }
}

/** Why an avatar could not be saved. */
export type AvatarSaveFailure = "invalid" | "too_large" | "quota" | "unavailable";

export type AvatarSaveResult = { ok: true } | { ok: false; reason: AvatarSaveFailure };

/** User-facing message for each save failure. (#761) */
export const AVATAR_SAVE_ERRORS: Record<AvatarSaveFailure, string> = {
  invalid: "That image couldn't be read. Try a different file.",
  too_large: `Image is too large — the limit is ${formatBytes(AVATAR_MAX_BYTES)}.`,
  quota:
    "Browser storage is full, so the image wasn't saved. Remove another account's avatar or clear this site's data, then try again.",
  unavailable: "Browser storage isn't available (for example in private browsing), so the image can't be saved.",
};

/** True for the error browsers throw when localStorage is out of space. */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === "QuotaExceededError" ||
    // Firefox
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    // Legacy WebKit / Firefox numeric codes
    code === 22 ||
    code === 1014
  );
}

/**
 * Persists `dataUrl` for `address`, reporting why when it can't: not a safe
 * data URL, longer than any picked image could be, storage unavailable, or
 * storage full. (#761)
 */
export function saveAvatarResult(address: string | null | undefined, dataUrl: string): AvatarSaveResult {
  if (!address || !isRenderableAvatar(dataUrl)) return { ok: false, reason: "invalid" };
  if (dataUrl.length > AVATAR_MAX_STORED_LENGTH) return { ok: false, reason: "too_large" };
  const store = storage();
  if (!store) return { ok: false, reason: "unavailable" };
  try {
    store.setItem(avatarStorageKey(address), dataUrl);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isQuotaExceededError(error) ? "quota" : "unavailable" };
  }
}

/**
 * Persists `dataUrl` for `address`. Returns false when the value is not a safe
 * data URL or the write failed; use {@link saveAvatarResult} to find out why.
 */
export function saveAvatar(address: string | null | undefined, dataUrl: string): boolean {
  return saveAvatarResult(address, dataUrl).ok;
}

/** A decoded image, as much of it as downscaling needs. */
export interface LoadedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
}

/** The part of a canvas downscaling needs. */
export interface AvatarCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): Pick<CanvasRenderingContext2D, "drawImage"> | null;
  toDataURL(type?: string, quality?: number): string;
}

export interface DownscaleOptions {
  maxDimension?: number;
  /** Decodes a data URL. Defaults to an `<img>` element. */
  loadImage?: (src: string) => Promise<LoadedImage>;
  /** Creates a canvas. Defaults to a `<canvas>` element. */
  createCanvas?: () => AvatarCanvas | null;
}

const IMAGE_LOAD_TIMEOUT_MS = 5_000;

function loadImageElement(src: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error("image load timed out")), IMAGE_LOAD_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, source: img });
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("image could not be decoded"));
    };
    img.src = src;
  });
}

function createCanvasElement(): AvatarCanvas | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  // Probe for 2D support up front; without it there is nothing to draw on.
  try {
    return canvas.getContext("2d") ? canvas : null;
  } catch {
    return null;
  }
}

/**
 * Shrinks an image data URL so its longest side is at most `maxDimension`
 * pixels, re-encoded as WebP (or whatever the browser produces when it can't
 * encode WebP). Returns the smaller of the result and the original, and the
 * original unchanged whenever downscaling is impossible (no canvas, image
 * won't decode), so a picked image is never lost. Animated GIFs keep only
 * their first frame. (#761)
 */
export async function downscaleAvatar(dataUrl: string, options: DownscaleOptions = {}): Promise<string> {
  const maxDimension = options.maxDimension ?? AVATAR_MAX_DIMENSION;
  const canvas = (options.createCanvas ?? createCanvasElement)();
  if (!canvas) return dataUrl;

  try {
    const image = await (options.loadImage ?? loadImageElement)(dataUrl);
    if (image.width <= 0 || image.height <= 0) return dataUrl;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const scaled = canvas.toDataURL("image/webp", 0.85);
    return isRenderableAvatar(scaled) && scaled.length < dataUrl.length ? scaled : dataUrl;
  } catch {
    return dataUrl;
  }
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
