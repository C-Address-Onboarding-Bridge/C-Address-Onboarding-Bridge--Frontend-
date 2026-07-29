/**
 * Locale-sensitive display formatting.
 *
 * The app ships a single language: every UI string is an English literal and
 * the document declares `<html lang="en">` in app/layout.tsx. Formatting must
 * agree with that declaration, so this module pins an explicit locale instead
 * of letting each call site inherit the ambient runtime locale.
 *
 * Two things go wrong when `toLocaleDateString()` is called with no locale:
 *
 *   - It resolves to the *host's* locale, so the same transaction reads
 *     "3/14/2026" on one machine and "14.03.2026" on another while the text
 *     around it stays English. Under SSR it resolves to the server's locale
 *     and then to the browser's on hydration, which React reports as a text
 *     mismatch.
 *   - It makes rendered output untestable: an assertion that passes in CI
 *     (en-US) fails for a contributor whose machine is set to de-DE.
 *
 * When real multi-language support arrives, APP_LOCALE becomes the negotiated
 * request locale and these helpers take it as a parameter; call sites don't
 * change.
 */

/** Display locale for the app. Keep in sync with `<html lang>` in app/layout.tsx. */
export const APP_LOCALE = "en-US";

/** Shown in place of a date/amount that cannot be formatted. */
export const EMPTY_VALUE = "—";

/**
 * Formats a transaction timestamp as a short calendar date.
 *
 * Timestamps reach the UI via `new Date(p.created_at || Date.now()).getTime()`
 * in lib/stellar.ts, which yields NaN for a malformed Horizon `created_at`.
 * Formatting that directly renders the literal string "Invalid Date" into the
 * transaction list, so unusable input collapses to EMPTY_VALUE instead.
 */
export function formatTransactionDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return EMPTY_VALUE;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;

  return date.toLocaleDateString(APP_LOCALE, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
