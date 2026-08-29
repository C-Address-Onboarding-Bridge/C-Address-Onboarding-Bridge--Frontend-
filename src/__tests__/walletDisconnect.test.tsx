// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { WalletProvider } from "@/components/wallet-provider";
import Navbar from "@/components/navbar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";
const CHIP = `${ADDRESS.slice(0, 4)}...${ADDRESS.slice(-4)}`;

// Freighter stays connected throughout — that is the whole point of #288: the
// poller kept re-reading it and silently undoing the user's disconnect.
vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    formatNetworkLabel: actual.formatNetworkLabel,
    checkConnection: vi.fn(async () => true),
    getWalletAddress: vi.fn(async () => ADDRESS),
    getWalletNetwork: vi.fn(async () => ({ status: "TESTNET", name: "TESTNET" })),
    connectWallet: vi.fn(async () => ADDRESS),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/bridge",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("Wallet disconnect control (#288)", () => {
  let container: HTMLDivElement;
  let root: Root;

  const query = <T extends Element>(selector: string) => container.querySelector<T>(selector);

  beforeEach(async () => {
    // The disconnect decision is persisted now (#343), so it has to be reset
    // between cases or one test's disconnect starts the next one signed out.
    localStorage.clear();
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <WalletProvider>
          <Navbar />
        </WalletProvider>
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  const click = async (el: Element | null) => {
    expect(el).not.toBeNull();
    await act(async () => {
      (el as HTMLElement).click();
    });
  };

  const openMobileMenu = async () => {
    await click(query('button[aria-controls="mobile-menu"]'));
  };

  it("renders a disconnect control on desktop when connected", () => {
    expect(container.textContent).toContain(CHIP);
    expect(query('button[aria-label="Disconnect wallet"]')).not.toBeNull();
  });

  it("renders a keyboard-focusable disconnect control in the mobile menu", async () => {
    await openMobileMenu();

    const menu = query("#mobile-menu");
    expect(menu?.textContent).toContain("Disconnect Wallet");

    // A real <button>, so it is reachable by keyboard without extra tabindex.
    const mobileDisconnect = Array.from(menu!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Disconnect Wallet")
    );
    expect(mobileDisconnect).toBeDefined();
    expect(mobileDisconnect!.getAttribute("disabled")).toBeNull();
  });

  it("stays disconnected past several poll intervals", async () => {
    await click(query('button[aria-label="Disconnect wallet"]'));
    expect(container.textContent).not.toContain(CHIP);

    // The poller ticks every 3s and backs off to 10s; 15s covers several ticks.
    await advance(15_000);

    expect(container.textContent).not.toContain(CHIP);
    expect(container.textContent).toContain("Connect Wallet");
  });

  it("disconnects from the mobile menu and stays disconnected", async () => {
    await openMobileMenu();
    const mobileDisconnect = Array.from(query("#mobile-menu")!.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Disconnect Wallet")
    );

    await click(mobileDisconnect!);
    await advance(15_000);

    expect(container.textContent).not.toContain(CHIP);
  });

  it("reconnects when the user explicitly connects again", async () => {
    await click(query('button[aria-label="Disconnect wallet"]'));
    await advance(5_000);
    expect(container.textContent).not.toContain(CHIP);

    const connectButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Connect Wallet")
    );
    await click(connectButton!);

    expect(container.textContent).toContain(CHIP);

    // …and polling resumes: connect() cleared the sticky flag rather than
    // merely bypassing it once.
    await advance(10_000);
    expect(container.textContent).toContain(CHIP);
  });

  // #343: the flag used to live only in a ref, so a reload re-adopted the
  // still-connected Freighter account and undid the disconnect.
  it("stays disconnected across a remount (page reload)", async () => {
    await click(query('button[aria-label="Disconnect wallet"]'));
    expect(container.textContent).not.toContain(CHIP);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WalletProvider>
          <Navbar />
        </WalletProvider>
      );
    });
    await advance(15_000);

    expect(container.textContent).not.toContain(CHIP);
    expect(container.textContent).toContain("Connect Wallet");
  });

  it("reconnects normally on a remount when the user never disconnected", async () => {
    expect(container.textContent).toContain(CHIP);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WalletProvider>
          <Navbar />
        </WalletProvider>
      );
    });
    await advance(3_000);

    expect(container.textContent).toContain(CHIP);
  });
});
