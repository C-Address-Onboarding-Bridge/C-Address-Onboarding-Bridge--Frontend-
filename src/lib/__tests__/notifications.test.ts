// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  NOTIFICATIONS_STORAGE_KEY,
  MAX_NOTIFICATIONS,
  addNotification,
  clearNotifications,
  dismissNotification,
  formatNotificationAge,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
  type AppNotification,
} from "@/lib/notifications";

const BASE = {
  kind: "transaction" as const,
  title: "Transaction submitted",
  message: "10 XLM to CABC…",
  href: "https://stellar.expert/explorer/testnet/tx/abc",
};

describe("notification centre persistence (#477)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty with zero unread", () => {
    expect(loadNotifications()).toEqual([]);
    expect(unreadNotificationCount([])).toBe(0);
  });

  it("adds a notification unread and at the top of the list", () => {
    const first = addNotification({ ...BASE, message: "first" });
    const second = addNotification({ ...BASE, message: "second" });

    const items = loadNotifications();
    expect(items.map((n) => n.id)).toEqual([second.id, first.id]);
    expect(items.every((n) => n.read === false)).toBe(true);
    expect(items[0]).toMatchObject({ kind: "transaction", title: "Transaction submitted" });
    expect(typeof items[0].id).toBe("string");
    expect(typeof items[0].timestamp).toBe("number");
  });

  it("persists across reloads (re-reading storage)", () => {
    const added = addNotification(BASE);
    // Simulates a fresh page load reading storage again.
    const reloaded = loadNotifications();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe(added.id);
  });

  it("counts unread notifications", () => {
    addNotification(BASE);
    addNotification(BASE);
    markNotificationRead(loadNotifications()[0].id);

    expect(unreadNotificationCount(loadNotifications())).toBe(1);
  });

  it("marks a single notification read", () => {
    const added = addNotification(BASE);
    markNotificationRead(added.id);

    const items = loadNotifications();
    expect(items.find((n) => n.id === added.id)?.read).toBe(true);
    expect(unreadNotificationCount(items)).toBe(0);
  });

  it("marks all notifications read", () => {
    addNotification(BASE);
    addNotification(BASE);
    markAllNotificationsRead();

    expect(loadNotifications().every((n) => n.read)).toBe(true);
  });

  it("dismisses a single notification", () => {
    const first = addNotification(BASE);
    const second = addNotification(BASE);

    dismissNotification(first.id);

    const items = loadNotifications();
    expect(items.map((n) => n.id)).toEqual([second.id]);
  });

  it("clearNotifications removes everything", () => {
    addNotification(BASE);
    addNotification(BASE);
    clearNotifications();

    expect(loadNotifications()).toEqual([]);
    expect(localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)).toBeNull();
  });

  it("caps the retained list at MAX_NOTIFICATIONS, dropping the oldest", () => {
    const first = addNotification(BASE);
    // MAX_NOTIFICATIONS more pushes the list one past the cap, so the very
    // first notification has to fall off the end.
    for (let i = 0; i < MAX_NOTIFICATIONS; i++) {
      addNotification(BASE);
    }

    const items = loadNotifications();
    expect(items).toHaveLength(MAX_NOTIFICATIONS);
    expect(items.some((n) => n.id === first.id)).toBe(false);
    expect(items[0].message).toBe(BASE.message);
  });

  it("falls back to an empty list on corrupt or unexpected stored data", () => {
    for (const raw of ["not json", "null", "{}", '{"items":[]}', "[1,2,3]"]) {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, raw);
      expect(loadNotifications()).toEqual([]);
    }
  });

  it("drops malformed entries while keeping valid ones", () => {
    const valid = addNotification(BASE);
    localStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify([
        { id: "bad", title: 5, message: "x", href: "/", timestamp: 1, read: false, kind: "transaction" },
        { id: "missing-kind", title: "t", message: "m", href: "/", timestamp: 1, read: false },
        { id: "unknown-kind", title: "t", message: "m", href: "/", timestamp: 1, read: false, kind: "nope" },
        valid,
      ])
    );

    const items = loadNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(valid.id);
  });

  it("normalises a non-boolean read field to the parsed shape", () => {
    localStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify([{ ...BASE, id: "x", timestamp: 1, read: "yes" }])
    );
    expect(loadNotifications()).toEqual([]);
  });
});

describe("formatNotificationAge", () => {
  const NOW = 1_700_000_000_000;

  it("labels recent events as just now", () => {
    expect(formatNotificationAge(NOW - 5_000, NOW)).toBe("just now");
  });

  it("formats minutes, hours, and days", () => {
    expect(formatNotificationAge(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(formatNotificationAge(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
    expect(formatNotificationAge(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
  });

  it("falls back to a date for events older than a week", () => {
    const age = formatNotificationAge(NOW - 10 * 86_400_000, NOW);
    expect(age).not.toMatch(/ago$/);
    expect(age).toBeTruthy();
  });

  it("does not produce negative ages for future timestamps", () => {
    expect(formatNotificationAge(NOW + 60_000, NOW)).toBe("just now");
  });
});

describe("AppNotification shape", () => {
  it("supports the claimable and schedule kinds for future events", () => {
    const claimable: AppNotification = {
      id: "c1",
      kind: "claimable",
      title: "Claimable balance",
      message: "A claimable balance is ready",
      href: "/dashboard",
      timestamp: 1,
      read: false,
    };
    const schedule: AppNotification = {
      id: "s1",
      kind: "schedule",
      title: "Schedule executed",
      message: "Recurring funding executed",
      href: "/dashboard",
      timestamp: 1,
      read: true,
    };
    expect(claimable.kind).toBe("claimable");
    expect(schedule.kind).toBe("schedule");
  });
});
