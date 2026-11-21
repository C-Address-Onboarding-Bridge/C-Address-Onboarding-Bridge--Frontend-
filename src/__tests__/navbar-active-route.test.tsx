// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import Navbar from "@/components/navbar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPathname = "/bridge/confirm";

vi.mock("@/lib/types", () => ({
  APP_NETWORK: "PUBLIC",
  HORIZON_URL: {
    PUBLIC: "https://horizon.stellar.org",
    TESTNET: "https://horizon-testnet.stellar.org",
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => ({
    isConnected: true,
    address: "GBDEV...MOCK",
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    networkStatus: "PUBLIC",
    walletNetworkName: "PUBLIC",
    isNetworkSupported: true,
    switchNetwork: vi.fn(),
  }),
}));

describe("Navbar active route highlighting (#1120)", () => {
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
    vi.restoreAllMocks();
  });

  it("highlights parent nav item for nested routes using isActiveRoute", async () => {
    mockPathname = "/bridge/confirm";
    await act(async () => {
      root?.render(<Navbar />);
    });

    const bridgeLinks = container?.querySelectorAll('a[href="/bridge"]');
    expect(bridgeLinks && bridgeLinks.length).toBeGreaterThan(0);
    const desktopBridge = bridgeLinks![0];
    expect(desktopBridge.className).toContain("text-[var(--primary-light)]");

    const onrampLinks = container?.querySelectorAll('a[href="/onramp"]');
    expect(onrampLinks && onrampLinks.length).toBeGreaterThan(0);
    const desktopOnramp = onrampLinks![0];
    expect(desktopOnramp.className).not.toContain("text-[var(--primary-light)]");
  });
});
