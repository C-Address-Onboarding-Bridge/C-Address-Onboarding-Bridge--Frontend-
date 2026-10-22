/**
 * Inactivity timeout management for wallet sessions.
 *
 * Tracks user activity and enforces a timeout separate from the session TTL.
 * When inactive for the configured duration, warns the user and can require
 * wallet re-confirmation for sensitive actions like funding.
 */

export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes default
export const INACTIVITY_WARNING_MS = 14 * 60 * 1000; // Warn 1 minute before timeout
export const INACTIVITY_STORAGE_KEY = "wallet:lastActivity";
export const REAUTH_REQUIRED_KEY = "wallet:reauthRequired";

export interface InactivityState {
  lastActivityAt: number;
  isTimedOut: boolean;
  isWarning: boolean;
  reauthRequired: boolean;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function recordActivity(now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(INACTIVITY_STORAGE_KEY, String(now));
  } catch {
    // Quota or privacy-mode failure
  }
}

export function getLastActivityTime(now: number = Date.now()): number {
  const store = storage();
  if (!store) return now;
  try {
    const stored = store.getItem(INACTIVITY_STORAGE_KEY);
    if (!stored) return now;
    const parsed = parseInt(stored, 10);
    if (!Number.isFinite(parsed) || parsed > now) {
      // Corrupt or future timestamp: reset it.
      store.removeItem(INACTIVITY_STORAGE_KEY);
      return now;
    }
    return parsed;
  } catch {
    return now;
  }
}

export function getInactivityState(now: number = Date.now(), timeoutMs: number = INACTIVITY_TIMEOUT_MS): InactivityState {
  const lastActivity = getLastActivityTime(now);
  const inactiveFor = now - lastActivity;
  const isTimedOut = inactiveFor > timeoutMs;
  const isWarning = inactiveFor > timeoutMs - (INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS);
  // The timed-out flag is derived purely from elapsed time, so it resets the
  // moment `now` is re-evaluated (e.g. a page reload bumps `now` without any
  // real user activity). The re-auth requirement has to be sticky across
  // reloads, so it's honoured from the persisted flag set by
  // markReauthRequired() and only cleared by clearReauthRequired() after an
  // explicit wallet re-confirmation.
  const reauthRequired = isTimedOut || isReauthRequired();

  return { lastActivityAt: lastActivity, isTimedOut, isWarning, reauthRequired };
}

export function extendSession(now: number = Date.now()): void {
  recordActivity(now);
}

export function clearInactivityState(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(INACTIVITY_STORAGE_KEY);
    store.removeItem(REAUTH_REQUIRED_KEY);
  } catch {
    // Ignore
  }
}

export function markReauthRequired(now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(REAUTH_REQUIRED_KEY, String(now));
  } catch {
    // Quota or privacy-mode failure
  }
}

export function isReauthRequired(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(REAUTH_REQUIRED_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearReauthRequired(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(REAUTH_REQUIRED_KEY);
  } catch {
    // Ignore
  }
}

export function clearSensitiveState(): void {
  const store = storage();
  if (!store) return;
  try {
    // Clear any sensitive in-memory data that might be cached
    // This would typically include form data, transaction details, etc.
    // Specific sensitive data would be cleared by the application
    sessionStorage?.clear?.();
  } catch {
    // Ignore
  }
}
