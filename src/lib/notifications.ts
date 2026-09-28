/**
 * Notification centre persistence (#477).
 *
 * Feedback in the app used to be transient — a toast appears during an action
 * and is gone, so a user who navigates away mid-transaction (or returns later)
 * has no record of what happened. Notifications recorded here survive reloads
 * and are surfaced from the navbar's notification centre.
 *
 * The storage conventions mirror `src/lib/session.ts`: records live in
 * `localStorage`, all accessors are SSR-safe, and unreadable or corrupt stored
 * state falls back to an empty list rather than throwing. Only the kinds of
 * events that actually occur in the app today are produced (transaction
 * outcomes); `claimable` and `schedule` kinds exist so the same store can
 * carry claimable-lock and schedule-execution events once those flows ship.
 *
 * Notifications are scoped per wallet address and network (#694): on a shared
 * browser the next account must never see the previous account's activity, so
 * each wallet+network pair gets its own storage key and disconnecting clears
 * the active scope.
 */

export const NOTIFICATIONS_STORAGE_KEY = "wallet:notifications";

/** Cap on retained notifications; the oldest are dropped first. */
export const MAX_NOTIFICATIONS = 50;

/** The kinds of events the notification centre can carry. */
export type NotificationKind = "transaction" | "claimable" | "schedule" | "failure";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  /**
   * Where the notification deep-links to. Internal routes (e.g. "/bridge")
   * navigate in-app; absolute URLs (e.g. a stellar.expert transaction page)
   * open in a new tab.
   */
  href: string;
  /** Epoch ms the event happened. */
  timestamp: number;
  read: boolean;
}

/**
 * Identifies the wallet+network a notification belongs to. Notifications are
 * stored under a key derived from this so one account's activity is never
 * shown to the next account on the same browser.
 */
export interface NotificationScope {
  address: string;
  network: string;
}

const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "transaction",
  "claimable",
  "schedule",
  "failure",
];

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Access itself throws in some privacy modes.
    return null;
  }
}

/**
 * Builds the per-wallet storage key. The address and network are encoded so
 * they cannot collide with the separator, and an empty scope falls back to the
 * legacy global key so callers without a connected wallet keep working.
 */
export function notificationsStorageKey(scope?: NotificationScope | null): string {
  if (!scope || !scope.address) return NOTIFICATIONS_STORAGE_KEY;
  const address = encodeURIComponent(scope.address);
  const network = encodeURIComponent(scope.network || "");
  return `${NOTIFICATIONS_STORAGE_KEY}:${network}:${address}`;
}

/** Collision-resistant id, with a fallback for environments without crypto. */
export function createNotificationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Coerces an unknown parsed value into a valid notification list, dropping any
 * entry that does not match the expected shape. This is what makes corrupt or
 * hand-edited storage harmless: one bad entry never takes the whole centre
 * down.
 */
function parseNotifications(raw: string | null): AppNotification[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const valid: AppNotification[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Partial<AppNotification>;
    if (
      typeof candidate.id === "string" &&
      typeof candidate.title === "string" &&
      typeof candidate.message === "string" &&
      typeof candidate.href === "string" &&
      typeof candidate.timestamp === "number" &&
      typeof candidate.read === "boolean" &&
      typeof candidate.kind === "string" &&
      (NOTIFICATION_KINDS as readonly string[]).includes(candidate.kind)
    ) {
      valid.push({
        id: candidate.id,
        kind: candidate.kind as NotificationKind,
        title: candidate.title,
        message: candidate.message,
        href: candidate.href,
        timestamp: candidate.timestamp,
        read: candidate.read,
      });
    }
  }
  return valid;
}

function writeNotifications(
  notifications: AppNotification[],
  scope?: NotificationScope | null
): AppNotification[] {
  const store = storage();
  if (!store) return notifications;
  try {
    store.setItem(notificationsStorageKey(scope), JSON.stringify(notifications));
  } catch {
    // Quota or privacy-mode failure: the caller keeps its in-memory copy, the
    // only loss is persistence across reloads.
  }
  return notifications;
}

/**
 * Reads the stored notifications for a wallet+network scope. Corrupt or absent
 * storage yields []. When no scope is given the legacy global key is read.
 */
export function loadNotifications(scope?: NotificationScope | null): AppNotification[] {
  const store = storage();
  if (!store) return [];
  let raw: string | null = null;
  try {
    raw = store.getItem(notificationsStorageKey(scope));
  } catch {
    return [];
  }
  return parseNotifications(raw);
}

/**
 * Records a new notification at the top of the list, dropping the oldest entry
 * once {@link MAX_NOTIFICATIONS} is exceeded. New notifications always start
 * unread. The notification is stored under the given wallet+network scope.
 */
export function addNotification(
  input: Omit<AppNotification, "id" | "timestamp" | "read">,
  scope?: NotificationScope | null
): AppNotification {
  const notification: AppNotification = {
    ...input,
    id: createNotificationId(),
    timestamp: Date.now(),
    read: false,
  };
  const next = [notification, ...loadNotifications(scope)].slice(0, MAX_NOTIFICATIONS);
  writeNotifications(next, scope);
  return notification;
}

/** Marks a single notification as read within a wallet+network scope. */
export function markNotificationRead(id: string, scope?: NotificationScope | null): void {
  writeNotifications(
    loadNotifications(scope).map((n) => (n.id === id ? { ...n, read: true } : n)),
    scope
  );
}

/** Marks every notification as read within a wallet+network scope. */
export function markAllNotificationsRead(scope?: NotificationScope | null): void {
  writeNotifications(
    loadNotifications(scope).map((n) => ({ ...n, read: true })),
    scope
  );
}

/** Removes a single notification (dismiss) within a wallet+network scope. */
export function dismissNotification(id: string, scope?: NotificationScope | null): void {
  writeNotifications(
    loadNotifications(scope).filter((n) => n.id !== id),
    scope
  );
}

/**
 * Removes every notification for a wallet+network scope. Called on disconnect
 * so the next user on a shared browser starts with an empty centre.
 */
export function clearNotifications(scope?: NotificationScope | null): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(notificationsStorageKey(scope));
  } catch {
    // Nothing useful to do; the list is already gone from memory.
  }
}

/** Count of unread notifications in a list. */
export function unreadNotificationCount(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}

/**
 * Short, human-readable age for a notification timestamp, e.g. "just now",
 * "5m ago", "3h ago", "2d ago". Used in the centre's list; falls back to a
 * locale date for anything older than a week.
 */
export function formatNotificationAge(timestamp: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
