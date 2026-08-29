// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NotificationCentre from "@/components/notification-centre";
import { addNotification, loadNotifications } from "@/lib/notifications";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("NotificationCentre", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the unread count on the bell", () => {
    addNotification({ kind: "transaction", title: "Tx A", message: "msg", href: "/bridge" });
    addNotification({ kind: "failure", title: "Tx B", message: "msg", href: "/bridge" });
    addNotification({ kind: "transaction", title: "Tx C", message: "msg", href: "/bridge" });

    render(<NotificationCentre />);
    const button = screen.getByRole("button", { name: /notifications/i });
    expect(button.getAttribute("aria-label")).toBe("Notifications, 3 unread");
    expect(button.textContent).toContain("3");
  });

  it("announces no unread items once everything is read", () => {
    addNotification({ kind: "transaction", title: "Tx A", message: "msg", href: "/bridge" });

    render(<NotificationCentre />);
    const button = screen.getByRole("button", { name: /notifications/i });
    expect(button.getAttribute("aria-label")).toBe("Notifications, 1 unread");

    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    expect(button.getAttribute("aria-label")).toBe("Notifications, no unread items");
  });

  it("lists notifications with their title, message, and age", () => {
    addNotification({
      kind: "transaction",
      title: "Transaction submitted",
      message: "10 XLM to CABC…",
      href: "/bridge",
    });

    render(<NotificationCentre />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByText("Transaction submitted")).not.toBeNull();
    expect(screen.getByText("10 XLM to CABC…")).not.toBeNull();
    expect(screen.getByText("just now")).not.toBeNull();
  });

  it("marks an individual notification read when its link is activated", () => {
    const added = addNotification({
      kind: "failure",
      title: "Transaction failed",
      message: "Signing failed",
      href: "/bridge",
    });

    render(<NotificationCentre />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    fireEvent.click(screen.getByRole("link", { name: /Transaction failed \(unread\)/i }));

    expect(loadNotifications().find((n) => n.id === added.id)?.read).toBe(true);
  });

  it("dismisses a single notification", () => {
    addNotification({ kind: "transaction", title: "Tx A", message: "msg", href: "/bridge" });
    const keep = addNotification({ kind: "failure", title: "Tx B", message: "msg", href: "/bridge" });

    render(<NotificationCentre />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    fireEvent.click(screen.getByRole("button", { name: /dismiss notification: Tx A/i }));

    const items = loadNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(keep.id);
  });

  it("clears all notifications", () => {
    addNotification({ kind: "transaction", title: "Tx A", message: "msg", href: "/bridge" });
    addNotification({ kind: "failure", title: "Tx B", message: "msg", href: "/bridge" });

    render(<NotificationCentre />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear all notifications/i }));

    expect(loadNotifications()).toEqual([]);
    expect(screen.getByText(/No notifications yet/i)).not.toBeNull();
  });

  it("closes the panel on Escape", () => {
    addNotification({ kind: "transaction", title: "Tx A", message: "msg", href: "/bridge" });

    render(<NotificationCentre />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByRole("dialog", { name: /notification centre/i })).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /notification centre/i })).toBeNull();
  });
});
