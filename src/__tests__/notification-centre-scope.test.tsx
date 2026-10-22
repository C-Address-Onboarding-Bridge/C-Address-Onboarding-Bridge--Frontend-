// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { addNotification, loadNotifications, notificationsStorageKey } from "@/lib/notifications";

/**
 * notification-centre.tsx was cut off mid-render and imported a nonexistent
 * `@/hooks/useWallet` (#844). These tests cover the restored list item and its
 * wallet scoping: they fail on the truncated file, which cannot even be loaded.
 */
// A tiny external store standing in for WalletContext, so a wallet change
// re-renders the (memoised) centre the way a context update does in the app.
const walletStore = vi.hoisted(() => {
  let state = { address: "GALICE" as string | null, network: "TESTNET" };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: Partial<typeof state>) => {
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("@/components/wallet-provider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useWallet: () => useSyncExternalStore(walletStore.subscribe, walletStore.get),
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import NotificationCentre from "@/components/notification-centre";

const ALICE = { address: "GALICE", network: "TESTNET" };
const BOB = { address: "GBOB", network: "TESTNET" };

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
}

beforeEach(() => {
  localStorage.clear();
  walletStore.set({ address: "GALICE", network: "TESTNET" });
});

afterEach(() => {
  cleanup();
});

describe("NotificationCentre (#844)", () => {
  it("shows only the connected wallet's notifications", () => {
    addNotification({ kind: "transaction", title: "Alice tx", message: "m", href: "/bridge" }, ALICE);
    addNotification({ kind: "transaction", title: "Bob tx", message: "m", href: "/bridge" }, BOB);

    render(<NotificationCentre />);
    openPanel();

    expect(screen.getByText("Alice tx")).not.toBeNull();
    expect(screen.queryByText("Bob tx")).toBeNull();
  });

  it("renders internal links, and external explorer links in a new tab", () => {
    addNotification({ kind: "transaction", title: "Internal", message: "m", href: "/bridge" }, ALICE);
    addNotification(
      { kind: "transaction", title: "Explorer", message: "m", href: "https://stellar.expert/explorer/testnet/tx/abc" },
      ALICE
    );

    render(<NotificationCentre />);
    openPanel();

    expect(screen.getByRole("link", { name: /Internal/ }).getAttribute("href")).toBe("/bridge");
    const external = screen.getByRole("link", { name: /Explorer/ });
    expect(external.getAttribute("target")).toBe("_blank");
    expect(external.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("never renders a tampered href as a link", () => {
    // Bypass addNotification's parse-time check, as a tampered store would.
    const tampered = [
      { id: "x1", kind: "transaction", title: "Tampered", message: "m", href: "javascript:alert(1)", timestamp: Date.now(), read: false },
    ];
    localStorage.setItem(notificationsStorageKey(ALICE), JSON.stringify(tampered));

    render(<NotificationCentre />);
    openPanel();

    expect(screen.queryByRole("link", { name: /Tampered/ })).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("marks read on activation and dismisses within the wallet's scope", () => {
    const first = addNotification({ kind: "failure", title: "First", message: "m", href: "/bridge" }, ALICE);
    addNotification({ kind: "failure", title: "Second", message: "m", href: "/bridge" }, ALICE);

    render(<NotificationCentre closeOnNavigate={false} />);
    openPanel();

    fireEvent.click(screen.getByRole("link", { name: /First \(unread\)/ }));
    expect(loadNotifications(ALICE).find((n) => n.id === first.id)?.read).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification: Second" }));
    expect(loadNotifications(ALICE).map((n) => n.title)).toEqual(["First"]);
    expect(screen.queryByText("Second")).toBeNull();
  });

  it("closes the panel when the wallet disconnects or switches account", () => {
    addNotification({ kind: "transaction", title: "Alice tx", message: "m", href: "/bridge" }, ALICE);
    render(<NotificationCentre />);
    openPanel();
    expect(screen.getByRole("dialog", { name: /notification centre/i })).not.toBeNull();

    act(() => walletStore.set({ address: "GBOB" }));
    expect(screen.queryByRole("dialog", { name: /notification centre/i })).toBeNull();

    openPanel();
    expect(screen.queryByText("Alice tx")).toBeNull();

    act(() => walletStore.set({ address: null }));
    expect(screen.queryByRole("dialog", { name: /notification centre/i })).toBeNull();
  });
});
