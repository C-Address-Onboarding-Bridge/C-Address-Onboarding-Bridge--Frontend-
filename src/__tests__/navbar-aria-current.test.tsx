/**
 * Tests for #901: navbar links must set aria-current="page" on the link
 * matching the current pathname, and no other link. Applies to both the
 * desktop and mobile lists.
 */
// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import Navbar from "@/components/navbar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- mock next/navigation ---------------------------------------------------
const mockPathname = vi.fn(() => "/bridge");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// --- mock next/link ----------------------------------------------------------
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => <a href={href} className={className}>{children}</a>,
}));

// --- mock prefetch-link (wraps next/link, forwards all props) ---------------
vi.mock("@/components/prefetch-link", () => ({
  PrefetchLink: ({
    children,
    href,
    className,
    "aria-current": ariaCurrent,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    "aria-current"?: string;
    onClick?: () => void;
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent} onClick={onClick}>
      {children}
    </a>
  ),
}));

// --- mock wallet provider ---------------------------------------------------
vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => ({
    isConnected: false,
    address: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    network: "TESTNET",
    networkStatus: "TESTNET",
    walletNetworkName: "Testnet",
    isNetworkSupported: true,
    networkMismatch: false,
    dismissNetworkMismatch: vi.fn(),
  }),
}));

// --- mock contexts that navbar uses -----------------------------------------
vi.mock("@/contexts/HelpContext", () => ({ useHelp: () => ({ openHelp: vi.fn() }) }));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));
vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn(), t: (k: string) => k }),
  SUPPORTED_LOCALES: ["en"],
}));

// ---------------------------------------------------------------------------

describe("#901 — navbar aria-current", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root?.unmount(); });
    container?.parentNode?.removeChild(container!);
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  it("sets aria-current='page' only on the /bridge desktop link when pathname is /bridge", async () => {
    mockPathname.mockReturnValue("/bridge");

    await act(async () => { root?.render(<Navbar />); });

    // Desktop links are in the hidden-md block (not inside #mobile-menu).
    // Grab all <a> links that are NOT inside the mobile menu.
    const allLinks = Array.from(
      container!.querySelectorAll<HTMLAnchorElement>("a[href]")
    ).filter((a) => !a.closest("#mobile-menu"));

    const currentLinks = allLinks.filter((a) => a.getAttribute("aria-current") === "page");
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0].getAttribute("href")).toBe("/bridge");
  });

  it("does not set aria-current on any link when pathname doesn't match any nav entry", async () => {
    mockPathname.mockReturnValue("/unknown-route");

    await act(async () => { root?.render(<Navbar />); });

    const allLinks = Array.from(
      container!.querySelectorAll<HTMLAnchorElement>("a[href]")
    );
    const currentLinks = allLinks.filter((a) => a.getAttribute("aria-current") === "page");
    expect(currentLinks).toHaveLength(0);
  });

  it("sets aria-current='page' only on the /dashboard desktop link when pathname is /dashboard", async () => {
    mockPathname.mockReturnValue("/dashboard");

    await act(async () => { root?.render(<Navbar />); });

    const allLinks = Array.from(
      container!.querySelectorAll<HTMLAnchorElement>("a[href]")
    ).filter((a) => !a.closest("#mobile-menu"));

    const currentLinks = allLinks.filter((a) => a.getAttribute("aria-current") === "page");
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0].getAttribute("href")).toBe("/dashboard");
  });

  it("sets aria-current='page' on the /bridge mobile link when mobile menu is open and pathname is /bridge", async () => {
    mockPathname.mockReturnValue("/bridge");

    await act(async () => { root?.render(<Navbar />); });

    // Open mobile menu
    const toggleBtn = container!.querySelector<HTMLButtonElement>(
      'button[aria-controls="mobile-menu"]'
    )!;
    await act(async () => { toggleBtn.click(); });

    const mobileLinks = Array.from(
      container!.querySelectorAll<HTMLAnchorElement>("#mobile-menu a[href]")
    );
    const currentMobileLinks = mobileLinks.filter(
      (a) => a.getAttribute("aria-current") === "page"
    );
    expect(currentMobileLinks).toHaveLength(1);
    expect(currentMobileLinks[0].getAttribute("href")).toBe("/bridge");
  });

  it("has aria-label='Main navigation' on the nav element", async () => {
    await act(async () => { root?.render(<Navbar />); });

    const nav = container!.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav!.getAttribute("aria-label")).toBe("Main navigation");
  });
});
