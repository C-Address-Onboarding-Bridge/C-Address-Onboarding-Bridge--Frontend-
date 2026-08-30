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
}

function freshSession(now: number): WalletSession {
  return { address: null, manuallyDisconnected: false, updatedAt: now };
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
  const { updatedAt } = session;
  // NaN or a future timestamp both count as expired
  if (!Number.isFinite(updatedAt)) return true;
  if (updatedAt > now) return true;
  return now > updatedAt + SESSION_TTL_MS;
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

  if (!session) return freshSession(now);

  if (isSessionExpired(session, now)) {
    // Drop the stale record
    try {
      store.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
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

/** Records an explicit connect, clearing any sticky disconnect. */
export function markConnected(address: string | null, now: number = Date.now()): WalletSession {
  const session: WalletSession = {
    address,
    manuallyDisconnected: false,
    updatedAt: now,
  };
  return writeSession(session);
}

/**
 * Records an explicit disconnect. The address is kept so a future feature (or a
 * debugging session) can tell which account was dropped.
 */
export function markDisconnected(address: string | null = null, now: number = Date.now()): WalletSession {
  const session: WalletSession = {
    address,
    manuallyDisconnected: true,
    updatedAt: now,
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
    // ignore
  }
}
