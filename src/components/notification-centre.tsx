"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import {
  clearNotifications,
  dismissNotification,
  formatNotificationAge,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
  type AppNotification,
} from "@/lib/notifications";

/**
 * Notification centre for transaction and account events (#477).
 *
 * A bell button in the navbar with an unread-count badge; clicking it opens a
 * panel listing recorded events (newest first). Each notification deep-links
 * to the relevant view, unread items are visually distinct, and the user can
 * mark items read (individually or all) or clear the list entirely.
 *
 * Persistence lives in `@/lib/notifications` (localStorage, following the
 * session-store conventions), so the centre is self-contained: it does not
 * depend on wallet state and renders identically connected or not.
 */

export interface NotificationCentreProps {
  /** When true, the panel closes when a notification link is activated. */
  closeOnNavigate?: boolean;
}

const NotificationCentre = ({ closeOnNavigate = true }: NotificationCentreProps) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => setNotifications(loadNotifications()), []);

  useEffect(() => {
    // Pull the persisted list into React state once on mount; subsequent
    // updates come from the explicit actions below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Escape closes the panel and returns focus to the bell.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const unread = unreadNotificationCount(notifications);

  const handleToggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      // Opening the panel marks nothing read; unread state is only changed by
      // explicit interaction or navigation.
      return next;
    });
  }, []);

  const handleActivate = useCallback(
    (id: string) => {
      markNotificationRead(id);
      refresh();
      if (closeOnNavigate) setOpen(false);
    },
    [refresh, closeOnNavigate]
  );

  const handleDismiss = useCallback(
    (id: string) => {
      dismissNotification(id);
      refresh();
    },
    [refresh]
  );

  const handleMarkAllRead = useCallback(() => {
    markAllNotificationsRead();
    refresh();
  }, [refresh]);

  const handleClearAll = useCallback(() => {
    clearNotifications();
    refresh();
  }, [refresh]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="notification-centre-panel"
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications, no unread items"
        }
        className="relative p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-[var(--primary)] text-white text-[0.625rem] font-semibold flex items-center justify-center"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-centre-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Notification centre"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unread === 0}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={notifications.length === 0}
                aria-label="Clear all notifications"
                title="Clear all notifications"
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                No notifications yet. Transaction outcomes and account events will
                appear here.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]">
              {notifications.map((notification) => {
                const isExternal = /^https?:\/\//.test(notification.href);
                const itemLabel = notification.read
                  ? notification.title
                  : `${notification.title} (unread)`;
                const content = (
                  <>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {!notification.read && (
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-full bg-[var(--primary)] flex-shrink-0"
                        />
                      )}
                      <span>{notification.title}</span>
                    </span>
                    <span className="block text-xs text-[var(--text-muted)] mt-0.5 pr-6">
                      {notification.message}
                    </span>
                    <span className="block text-[0.6875rem] text-[var(--text-muted)] mt-1">
                      {formatNotificationAge(notification.timestamp)}
                    </span>
                  </>
                );
                return (
                  <li
                    key={notification.id}
                    className={`relative group ${notification.read ? "" : "bg-[var(--surface-2)]/50"}`}
                  >
                    {isExternal ? (
                      <a
                        href={notification.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleActivate(notification.id)}
                        aria-label={itemLabel}
                        className="block px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
                      >
                        {content}
                      </a>
                    ) : (
                      <Link
                        href={notification.href}
                        onClick={() => handleActivate(notification.id)}
                        aria-label={itemLabel}
                        className="block px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
                      >
                        {content}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDismiss(notification.id)}
                      aria-label={`Dismiss notification: ${notification.title}`}
                      title="Dismiss notification"
                      className="absolute top-3 right-3 p-1 rounded text-[var(--text-muted)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--error)] transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(NotificationCentre);
