// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import DashboardPage from "@/components/routes/dashboard-page";

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";

const mockUseWallet = vi.hoisted(() => vi.fn());

vi.mock("@/components/wallet-provider", () => ({
  useWallet: mockUseWallet,
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    getAccountBalances: vi.fn(async () => ({ total: "0", balances: [] })),
    fetchRecentTransactions: vi.fn(async () => []),
    getExplorerUrl: (_network: unknown, _type: unknown, id: string) => `https://stellar.expert/explorer/testnet/account/${id}`,
    formatNetworkLabel: (_status: unknown, _name?: string | null) => "Testnet",
    toSafeErrorMessage: (_e: unknown, fallback: string) => fallback,
    requestTestXLM: actual.requestTestXLM,
    isValidStellarAddress: vi.fn(() => true),
  };
});

vi.mock("@/lib/avatar", () => ({
  avatarInitials: (_address?: string | null) => "AB",
  loadAvatar: vi.fn(),
  saveAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  validateAvatarFile: vi.fn(() => ({ ok: true })),
  isRenderableAvatar: vi.fn(() => true),
  AVATAR_ACCEPT_ATTR: "image/*",
}));

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ status: "idle", copy: vi.fn(), reset: vi.fn() }),
}));

describe("Dashboard faucet", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const renderDashboard = async (walletOverrides: Partial<ReturnType<typeof mockUseWallet>> = {}) => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
      address: ADDRESS,
      network: "TESTNET",
      networkStatus: "TESTNET",
      walletNetworkName: "TESTNET",
      isNetworkSupported: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnecting: false,
      networkMismatch: false,
      dismissNetworkMismatch: vi.fn(),
      isOnline: true,
      pendingOperations: [],
      enqueueOperation: vi.fn(),
      cancelOperation: vi.fn(),
      confirmFunding: vi.fn(),
      ...walletOverrides,
    });

    await act(async () => {
      root.render(<DashboardPage />);
    });
  };

  it("renders faucet button on testnet when balance is zero", async () => {
    await renderDashboard();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(container.textContent).toContain("Request Test XLM");
  });

  it("does not render faucet button on mainnet", async () => {
    await renderDashboard({ network: "PUBLIC", networkStatus: "PUBLIC" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(container.textContent).not.toContain("Request Test XLM");
  });

  it("does not render faucet button when wallet is not connected", async () => {
    await renderDashboard({ isConnected: false, address: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(container.textContent).not.toContain("Request Test XLM");
  });

  it("shows developer checklist when connected", async () => {
    await renderDashboard();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(container.textContent).toContain("Developer Checklist");
    expect(container.textContent).toContain("Connect wallet");
    expect(container.textContent).toContain("Fund account");
    expect(container.textContent).toContain("Bridge assets");
  });

  it("does not show developer checklist when not connected", async () => {
    await renderDashboard({ isConnected: false, address: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(container.textContent).not.toContain("Developer Checklist");
  });
});
