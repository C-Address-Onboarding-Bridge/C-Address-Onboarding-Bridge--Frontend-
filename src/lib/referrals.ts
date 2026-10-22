/**
 * Referral program — types and pure display logic (#469).
 *
 * PLACEHOLDER INTERFACE: this repo vendors neither the referral-attribution
 * contract bindings nor a real API client for referral statistics yet (no
 * contract source, no referral-related route, nothing in docs — checked
 * before writing this, the same way #465's batch cap, #467's lock/claim
 * shape, #468's fee-tier preview, and #470's export endpoint were). Field
 * names and the API route in `src/lib/api.ts` are a best-guess shape and
 * MUST be reconciled against the real contract/API once available.
 *
 * The shareable referral link is built client-side from `referralCode`
 * rather than returned whole by the API — that keeps the placeholder
 * endpoint from needing to know the frontend's own origin.
 */
export interface ReferralVolumePoint {
  /** ISO date, e.g. "2026-08-01". */
  date: string;
  /** Referred volume attributed to this account on this day, in the quoted asset. */
  volume: number;
}

export interface ReferralStats {
  /** This account's referral code; combined with the app origin to build the shareable link. */
  referralCode: string;
  /** Cumulative volume referred by this account, in the quoted asset. */
  referredVolume: number;
  /** Number of referred transactions. */
  referredTransactionCount: number;
  /** Cumulative referral fees accrued to this account, in the quoted asset. */
  accruedFees: number;
  /** Daily referred-volume series, ascending by date, for the dashboard chart. */
  volumeOverTime: ReferralVolumePoint[];
}

/**
 * True once the account has at least one referred transaction. A brand new
 * account's `volumeOverTime` is all zeros, so this — not an empty array
 * check — is what the empty state renders on (#469 requirement 5: show a
 * meaningful message instead of a blank/broken chart).
 */
export function hasReferralActivity(stats: Pick<ReferralStats, "referredTransactionCount">): boolean {
  return stats.referredTransactionCount > 0;
}

/** Builds the shareable referral link from the account's code and the app's own origin. */
export function buildReferralLink(referralCode: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/?ref=${encodeURIComponent(referralCode)}`;
}

/** Compact amount display, e.g. "1,234.56". */
export function formatReferralAmount(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Short display label for a volume point's date, e.g. "Aug 1". */
export function formatReferralDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Referral capture (#936): nothing in the app reads back a `?ref=CODE`
 * query param the referrals page itself hands out, so referred funding is
 * never attributed. This stores a captured code locally, scoped by network
 * (mainnet/testnet are different ledgers — attributing a mainnet funding to
 * a code captured on testnet, or vice versa, would be wrong) and with a TTL
 * so a stale bookmark/link doesn't attribute funding that happens months
 * later.
 *
 * Attribution contract with the backend (documented here since there is no
 * referral-attribution route yet — see the PLACEHOLDER INTERFACE note at
 * the top of this file): once a funding submission route exists, the
 * stored code from `getStoredReferralCode()` should be included as a
 * `referralCode` field in the request body of:
 *   - batch prepare (src/lib/batchFunding.ts's submission path)
 *   - lock create (src/lib/locks.ts's creation path)
 *   - the onramp server route, once it exists (src/app/api referenced in
 *     the issue as not yet built)
 * The backend is expected to validate the code still exists and isn't the
 * funder's own before crediting the referrer.
 */

/** A captured code is only honoured for this long before it's dropped. */
export const REFERRAL_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const REFERRAL_STORAGE_PREFIX = "referral:capturedCode";

interface StoredReferralCode {
  code: string;
  capturedAt: number;
}

function referralStorageKey(network: string): string {
  return `${REFERRAL_STORAGE_PREFIX}:${network}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A referral code is a short, URL-safe token — never free-form text. */
export function isValidReferralCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(value);
}

/**
 * Persists a freshly captured referral code for the given network, stamped
 * with `now` so it can expire later. Invalid codes are ignored.
 */
export function storeReferralCode(code: string, network: string, now: number = Date.now()): boolean {
  if (!isValidReferralCode(code)) return false;
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(referralStorageKey(network), JSON.stringify({ code, capturedAt: now } satisfies StoredReferralCode));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads back a previously captured, still-unexpired referral code for the
 * given network. Returns null once the TTL has elapsed, and clears the
 * expired entry so it isn't re-checked every call.
 */
export function getStoredReferralCode(network: string, now: number = Date.now()): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(referralStorageKey(network));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredReferralCode>;
    if (!isValidReferralCode(parsed.code) || typeof parsed.capturedAt !== "number") {
      store.removeItem(referralStorageKey(network));
      return null;
    }
    if (now - parsed.capturedAt > REFERRAL_CODE_TTL_MS) {
      store.removeItem(referralStorageKey(network));
      return null;
    }
    return parsed.code;
  } catch {
    store.removeItem(referralStorageKey(network));
    return null;
  }
}

export function clearStoredReferralCode(network: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(referralStorageKey(network));
  } catch {
    // Ignore
  }
}

/**
 * Captures a `ref` query param from the given URL into network-scoped
 * storage, and returns the URL with `ref` stripped (so it doesn't linger in
 * the address bar, get shared onward, or get double-counted on a refresh
 * that re-runs capture). Returns null when there is no valid `ref` param to
 * capture, so callers can skip the history update entirely.
 */
export function captureReferralFromUrl(url: string, network: string, now: number = Date.now()): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const ref = parsed.searchParams.get("ref");
  if (!isValidReferralCode(ref)) return null;

  storeReferralCode(ref, network, now);
  parsed.searchParams.delete("ref");
  const search = parsed.searchParams.toString();
  return `${parsed.pathname}${search ? `?${search}` : ""}${parsed.hash}`;
}
