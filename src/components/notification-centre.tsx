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
import { useWallet } from "@/hooks/useWallet";

/**
 * Notification centre for transaction and account events (#477).
 *
 * A bell button in the navbar with an unread-count badge; clicking it opens a
 * panel listing recorded events (newest first). Each notification deep-links
 * to the relevant view, unread items are visually distinct, and the user can
 * mark items read (individually or all) or clear the list entirely.
 *
 * Persistence lives in `@/lib/notifications` (localStorage, following the
 * session-store conventions). Notifications are scoped to the connected
 * wallet address and network (#694) so activity from one account is never
 * shown to the next account on a shared browser; on disconnect the panel is
 * closed and the list is emptied.
 *
 * Hrefs are validated at parse time (#695); this component additionally
 * re-checks before rendering so a tampered store can never produce a
 * `javascript:`/`data:` link in the trusted UI.
 */

export interface NotificationCentreProps {
  /** When true, the panel closes when a notification link is activated. */
  closeOnNavigate?: boolean;
}

/**
 * Returns true only for hrefs that are safe to render as a link:
 * same-origin relative paths (single leading `/`, no `//` or `\` tricks)
 * or absolute `https://stellar.expert/...` explorer URLs.
 */
const isSafeNotificationHref = (href: string): boolean => {
  if (typeof href !== "string" || href.length === 0) return false;
  // Reject control characters and whitespace that could smuggle a scheme.
  if (/[\u0000-\u001f\u007f\s]/.test(href)) return false;
  // Same-origin relative path: exactly one leading slash, not protocol-relative.
  if (href.startsWith("/")) {
    return !href.startsWith("//") && !href.startsWith("/\\");
  }
  // Absolute explorer URL: https scheme, host stellar.expert.
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname === "stellar.expert";
  } catch {
    return false;
  }
};

const NotificationCentre = ({ closeOnNavigate = true }: NotificationCentreProps) => {
  const { address, network } = useWallet();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    () => setNotifications(loadNotifications(address, network)),
    [address, network]
  );

  useEffect(() => {
    // Pull the persisted list into React state once on mount and whenever the
    // connected wallet/network changes; subsequent updates come from the
    // explicit actions below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // On disconnect (or wallet/network switch) close the panel so the next user
  // never sees the previous account's activity.
  useEffect(() => {
    if (!address) {
      setOpen(false);
    }
  }, [address]);

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
      markNotificationRead(id, address, network);
      refresh();
      if (closeOnNavigate) setOpen(false);
    },
    [refresh, closeOnNavigate, address, network]
  );

  const handleDismiss = useCallback(
    (id: string) => {
      dismissNotification(id, address, network);
      refresh();
    },
    [refresh, address, network]
  );

  const handleMarkAllRead = useCallback(() => {
    markAllNotificationsRead(address, network);
    refresh();
  }, [refresh, address, network]);

  const handleClearAll = useCallback(() => {
    clearNotifications(address, network);
    refresh();
  }, [refresh, address, network]);

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
                const safeHref = isSafeNotificationHref(notification.href)
                  ? notification.href
                  : null;
                const isExternal = safeHref !== null && /^https:\/\//.test(safeHref);
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
                    className={`

/* … truncated 1768 chars — edit only what you need near the top … */
