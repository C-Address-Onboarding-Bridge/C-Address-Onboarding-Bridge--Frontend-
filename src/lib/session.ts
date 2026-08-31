/**
 * Wallet session state that has to outlive a React render tree.
 *
 * The only piece of session state the app really owns is "did the user press
 * Disconnect?" — everything else (address, network) is read back from Freighter.
 * That flag used to live in a `useRef` inside `WalletProvider`, which meant a
 * page reload dropped it and the connection poller immediately re-adopted the
 * wallet, silently undoing the disconnect. Persisting it here fixes that and
 * gives the flag a single, testable home. (#343, follows on from #288)
 *
 * Records are stored in `localStorage` so the decision survives a reload and
 * applies to every tab on the origin, and they lapse after `SESSION_TTL_MS` so
 * a disconnect from days ago does not keep suppressing the wallet forever.
 *
 * All accessors are SSR-safe and tolerate unreadable, absent or corrupt
 * storage by falling back to a fresh session rather than throwing.
 */

export const SESSION_STORAGE_KEY = "wallet:session";

/** How long a stored session record stays authoritative: 12 hours. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface WalletSession {
  /** Address recorded at the last explicit connect, if any. */
  address: string | null;
  /** True when the user explicitly disconnected and has not reconnected. */
  manuallyDisconnected: boolean;
  /** Epoch ms this record was last written. */
  updatedAt: number;
  /**
   * The wallet ID last chosen by the user in the Stellar Wallets Kit modal
   * (e.g. "freighter", "xbull", "lobstr"). Persisted so the kit can restore
   * the same module on the next page load. (#459)
   */
  selectedWalletId: string | null;
}

function freshSession(now: number): WalletSession {
  return { address: null, manuallyDisconnected: false, updatedAt: now, selectedWalletId: null };
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

/** True when `session` is older than the TTL and should be discarded. */
export function isSessionExpired(session: WalletSession, now: number = Date.now()): boolean {
  return now - session.updatedAt > SESSION_TTL_MS;
}

function parseSession(raw: string | null): WalletSession | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<WalletSession>;
    return {
      address: typeof candidate.address === "string" ? candidate.address : null,
      manuallyDisconnected: candidate.manuallyDisconnected === true,
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
      selectedWalletId: typeof candidate.selectedWalletId === "string" ? candidate.selectedWalletId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Reads the stored session. Returns a fresh session when nothing is stored, the
 * record is unparseable, or it has expired — and drops the expired record so it
 * is not re-parsed on every call.
 */
export function loadSession(now: number = Date.now()): WalletSession {
  const store = storage();
  if (!store) return freshSession(now);

  const raw = store.getItem(SESSION_STORAGE_KEY);
  const session = parseSession(raw);

  if (!session || isSessionExpired(session, now)) {
    if (raw !== null) store.removeItem(SESSION_STORAGE_KEY);
    return freshSession(now);
  }

  return session;
}

function writeSession(session: WalletSession): WalletSession {
  const store = storage();
  if (!store) return session;
  try {
    store.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota or privacy-mode failure: the caller keeps its in-memory copy, the
    // only loss is persistence across reloads.
  }
  return session;
}

/**
 * Records an explicit connect, clearing any sticky disconnect. `walletId`
 * persists which wallet (Freighter, xBull, Lobstr, …) was selected via the
 * Stellar Wallets Kit modal, so a reload can restore the same one; omitting
 * it keeps whatever was previously persisted. (#459)
 */
export function markConnected(
  address: string | null,
  now: number = Date.now(),
  walletId?: string | null
): WalletSession {
  const session: WalletSession = {
    address: address ?? null,
    manuallyDisconnected: false,
    updatedAt: now,
    selectedWalletId: walletId !== undefined ? walletId : loadSession(now).selectedWalletId,
  };
  return writeSession(session);
}

/**
 * Records an explicit disconnect. The address is kept so a future feature (or a
 * debugging session) can tell which account was dropped.
 */
export function markDisconnected(address: string | null = null, now: number = Date.now()): WalletSession {
  const session: WalletSession = {
    address: address ?? null,
    manuallyDisconnected: true,
    updatedAt: now,
    selectedWalletId: loadSession(now).selectedWalletId,
  };
  return writeSession(session);
}

/** Removes the stored session entirely. */
export function clearSession(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore errors in privacy mode
  }
}
