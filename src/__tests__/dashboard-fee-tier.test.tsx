// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "@/components/routes/dashboard-page";
import type { FeeTierStatus } from "@/lib/feeTiers";

/**
 * Tests that the Fee Tier card on the Dashboard is wired correctly (#468),
 * including hiding both the card and its heading when no tiers are
 * configured — a heading over nothing would be exactly the "broken/empty"
 * display the issue says to avoid.
 *
 * src/lib/stellar ships stubbed (throwing) function bodies from an unrelated
 * seed commit — mocked here the same way the bridge page tests do.
 */

const ADDRESS = "G" + "A".repeat(55);

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => ({
    isConnected: true,
    address: ADDRESS,
    network: "TESTNET",
    networkStatus: "TESTNET",
    walletNetworkName: "Testnet",
    isNetworkSupported: true,
    connect: vi.fn(),
  }),
}));

vi.mock("@/lib/stellar", () => ({
  getAccountBalances: vi.fn().mockResolvedValue({ total: "100", balances: [] }),
  fetchRecentTransactions: vi.fn().mockResolvedValue([]),
  getExplorerUrl: () => "https://stellar.expert",
  formatNetworkLabel: () => "Testnet",
  toSafeErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ status: "idle", copy: vi.fn() }),
}));

vi.mock("@/lib/avatar", () => ({
  AVATAR_ACCEPT_ATTR: "image/png,image/jpeg,image/webp,image/gif",
  loadAvatar: () => null,
  isRenderableAvatar: () => false,
  validateAvatarFile: () => ({ ok: true }),
  saveAvatar: () => true,
  removeAvatar: () => {},
  avatarInitials: (address: string | null | undefined) => (address ? address.slice(0, 2) : "?"),
}));

const getFeeTierPreviewMock = vi.fn();
vi.mock("@/lib/api", () => ({
  getFeeTierPreview: (...args: unknown[]) => getFeeTierPreviewMock(...args),
}));

describe("DashboardPage — fee tier card (#468)", () => {
  afterEach(() => {
    getFeeTierPreviewMock.mockReset();
    vi.restoreAllMocks();
  });

  it("hides the card (and its heading) when no tiers are configured", async () => {
    getFeeTierPreviewMock.mockResolvedValue(null);
    render(<DashboardPage />);

    await waitFor(() => expect(getFeeTierPreviewMock).toHaveBeenCalledWith(ADDRESS, "TESTNET"));
    expect(screen.queryByText("Fee Tier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fee-tier-display")).not.toBeInTheDocument();
  });

  it("shows the tier card with progress for an intermediate tier", async () => {
    const status: FeeTierStatus = {
      currentVolume: 4000,
      currentTier: { name: "Silver", volumeThreshold: 1000, feeRate: 0.003 },
      nextTier: { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 },
      tiers: [
        { name: "Base", volumeThreshold: 0, feeRate: 0.005 },
        { name: "Silver", volumeThreshold: 1000, feeRate: 0.003 },
        { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 },
      ],
    };
    getFeeTierPreviewMock.mockResolvedValue(status);

    render(<DashboardPage />);

    expect(await screen.findByText("Fee Tier")).toBeInTheDocument();
    const display = screen.getByTestId("fee-tier-display");
    expect(display).toHaveTextContent("Silver tier");
    expect(screen.getByTestId("tier-progress")).toBeInTheDocument();
  });

  it("shows the top-tier message with no progress bar when there's no next tier", async () => {
    const status: FeeTierStatus = {
      currentVolume: 50000,
      currentTier: { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 },
      nextTier: null,
      tiers: [{ name: "Gold", volumeThreshold: 10000, feeRate: 0.001 }],
    };
    getFeeTierPreviewMock.mockResolvedValue(status);

    render(<DashboardPage />);

    await screen.findByTestId("fee-tier-display");
    expect(screen.getByTestId("top-tier-message")).toBeInTheDocument();
    expect(screen.queryByTestId("tier-progress")).not.toBeInTheDocument();
  });
});
