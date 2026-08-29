// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import Navbar from "@/components/navbar";

// Set React act environment flag for jsdom test runner
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/bridge",
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock wallet provider.
//
// The return type is declared rather than inferred from the default value: with
// inference, `address: null` narrows the field to `null` and any later
// `mockReturnValue` carrying a real address fails to typecheck.
type MockWallet = {
  isConnected: boolean;
  address: string | null;
  connect: () => void;
  isConnecting: boolean;
  [key: string]: unknown;
};

const mockUseWallet = vi.fn<() => MockWallet>(() => ({
  isConnected: false,
  address: null,
  connect: vi.fn(),
  isConnecting: false,
}));

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => mockUseWallet(),
}));

describe("Navbar Mobile Menu A11Y & Focus Management", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    mockUseWallet.mockReturnValue({
      isConnected: false,
      address: null,
      connect: vi.fn(),
      isConnecting: false,
    });
    vi.restoreAllMocks();
  });

  it("sets correct ARIA attributes on toggle button and mobile menu", async () => {
    await act(async () => {
      root?.render(<Navbar />);
    });

    const toggleBtn = container?.querySelector('button[aria-controls="mobile-menu"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    expect(toggleBtn.getAttribute("aria-label")).toBe("Open menu");

    // Click toggle to open menu
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");
    expect(toggleBtn.getAttribute("aria-label")).toBe("Close menu");

    const mobileMenu = container?.querySelector("#mobile-menu");
    expect(mobileMenu).not.toBeNull();
    expect(mobileMenu?.getAttribute("role")).toBe("region");
    expect(mobileMenu?.getAttribute("aria-label")).toBe("Mobile Navigation");
  });

  it("moves focus to the first nav link when mobile menu opens", async () => {
    vi.useFakeTimers();

    await act(async () => {
      root?.render(<Navbar />);
    });

    const toggleBtn = container?.querySelector('button[aria-controls="mobile-menu"]') as HTMLButtonElement;

    await act(async () => {
      toggleBtn.click();
    });

    // Run animation frames / microtasks
    act(() => {
      vi.runAllTimers();
    });

    const firstLink = container?.querySelector('#mobile-menu a[href="/bridge"]') as HTMLAnchorElement;
    expect(document.activeElement).toBe(firstLink);

    vi.useRealTimers();
  });

  it("closes mobile menu and restores focus to toggle button when Escape key is pressed", async () => {
    vi.useFakeTimers();

    await act(async () => {
      root?.render(<Navbar />);
    });

    const toggleBtn = container?.querySelector('button[aria-controls="mobile-menu"]') as HTMLButtonElement;

    // Open menu
    await act(async () => {
      toggleBtn.click();
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(container?.querySelector("#mobile-menu")).not.toBeNull();

    // Press Escape
    await act(async () => {
      const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      window.dispatchEvent(escapeEvent);
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(container?.querySelector("#mobile-menu")).toBeNull();
    expect(document.activeElement).toBe(toggleBtn);

    vi.useRealTimers();
  });

  it("renders an identical network badge in the desktop and mobile wallet-status displays", async () => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
      address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnecting: false,
      network: "TESTNET",
      networkStatus: "TESTNET",
      walletNetworkName: "Testnet",
      isNetworkSupported: true,
      networkMismatch: false,
      dismissNetworkMismatch: vi.fn(),
    });

    await act(async () => {
      root?.render(<Navbar />);
    });

    // The mobile wallet-status display only mounts while the mobile menu is open.
    const toggleBtn = container?.querySelector('button[aria-controls="mobile-menu"]') as HTMLButtonElement;
    await act(async () => {
      toggleBtn.click();
    });

    const badges = container?.querySelectorAll('span[title="Connected to Testnet"]');
    expect(badges?.length).toBe(2);
    badges?.forEach((badge) => {
      expect(badge.textContent).toBe("Testnet");
      expect(badge.className).toContain("rounded-full");
    });
  });

  it("restores focus to toggle button when mobile menu is closed via toggle button click", async () => {
    vi.useFakeTimers();

    await act(async () => {
      root?.render(<Navbar />);
    });

    const toggleBtn = container?.querySelector('button[aria-controls="mobile-menu"]') as HTMLButtonElement;

    // Open menu
    await act(async () => {
      toggleBtn.click();
    });

    act(() => {
      vi.runAllTimers();
    });

    // Close menu by clicking toggle button again
    await act(async () => {
      toggleBtn.click();
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(container?.querySelector("#mobile-menu")).toBeNull();
    expect(document.activeElement).toBe(toggleBtn);

    vi.useRealTimers();
  });
});
