// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BridgePage from "@/app/bridge/page";
import type { FeeTierStatus } from "@/lib/feeTiers";

/**
 * Tests that the fee tier display is wired into the bridge review step (#468).
 *
 * src/lib/stellar ships stubbed (throwing) function bodies from an unrelated
 * seed commit — mocked here the same way `bridge-flow-a11y.test.tsx` and
 * #467's `bridge-lock-option.test.tsx` do, so the page can render and only
 * the tier-specific wiring is under test.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALID_C_ADDRESS = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const FROM_ADDRESS = vi.hoisted(() => "G" + "A".repeat(55));

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => ({
    isConnected: true,
    address: FROM_ADDRESS,
    network: "TESTNET",
    networkStatus: "TESTNET",
    walletNetworkName: "Testnet",
    isNetworkSupported: true,
    isOnline: true,
    connect: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: unknown) => value,
}));

vi.mock("@/lib/stellar", () => ({
  isValidStellarAddress: (a: string) => /^[GC][A-Z0-9]{55}$/.test(a),
  isCAddress: (a: string) => /^C[A-Z0-9]{55}$/.test(a),
  isValidStellarAmount: (a: string) => /^\d+(\.\d{1,7})?$/.test(a),
  formatNetworkLabel: () => "Testnet",
  bridgeViaContract: vi.fn(),
  getExplorerUrl: () => "https://stellar.expert",
  getAccountBalances: vi.fn().mockResolvedValue(null),
  getAccountMinimumBalance: () => "1",
  getEstimatedFeeXLM: vi.fn().mockResolvedValue("~0.00001 XLM"),
  toSafeErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const getFeeTierPreviewMock = vi.fn();
vi.mock("@/lib/api", () => ({
  getFeeTierPreview: (...args: unknown[]) => getFeeTierPreviewMock(...args),
}));

// The review step requires `!bridgingBlocked`, which is never true for any
// valid C-address on this branch (#284's instant-bridging block, unrelated
// to #468) — so it is provably unreachable via the real UI here. The tier
// display is therefore wired into the form step as well (see the comment
// next to it in bridge/page.tsx), which these tests exercise directly.
async function fillForm() {
  fireEvent.change(screen.getByLabelText(/To \(C-address\)/i), { target: { value: VALID_C_ADDRESS } });
  fireEvent.change(screen.getByLabelText(/^Amount$/i), { target: { value: "1000" } });
  await waitFor(() => expect(screen.getByText(/G → C bridging isn't live yet/i)).toBeInTheDocument());
}

describe("Bridge form — fee tier display (#468)", () => {
  afterEach(() => {
    getFeeTierPreviewMock.mockReset();
    vi.restoreAllMocks();
  });

  it("fetches the fee tier preview for the connected address and network", async () => {
    getFeeTierPreviewMock.mockResolvedValue(null);
    render(<BridgePage />);

    await waitFor(() => expect(getFeeTierPreviewMock).toHaveBeenCalledWith(FROM_ADDRESS, "TESTNET"));
  });

  it("hides the tier display when no tiers are configured", async () => {
    getFeeTierPreviewMock.mockResolvedValue(null);
    render(<BridgePage />);
    await fillForm();

    await waitFor(() => expect(getFeeTierPreviewMock).toHaveBeenCalled());
    expect(screen.queryByTestId("fee-tier-display")).not.toBeInTheDocument();
  });

  it("shows the current tier and a discounted fee quote for an intermediate tier", async () => {
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

    render(<BridgePage />);
    await fillForm();

    const display = await screen.findByTestId("fee-tier-display");
    expect(display).toHaveTextContent("Silver tier");
    expect(display).toHaveTextContent("0.30%");
    // 1000 * 0.003 = 3, the tiered rate — not 1000 * 0.005 (Base/flat rate).
    expect(screen.getByTestId("tiered-fee-quote")).toHaveTextContent("3.0000000 XLM");
    expect(screen.getByTestId("tier-progress")).toBeInTheDocument();
  });

  it("shows the top-tier message when the account has no next tier", async () => {
    const status: FeeTierStatus = {
      currentVolume: 50000,
      currentTier: { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 },
      nextTier: null,
      tiers: [
        { name: "Base", volumeThreshold: 0, feeRate: 0.005 },
        { name: "Gold", volumeThreshold: 10000, feeRate: 0.001 },
      ],
    };
    getFeeTierPreviewMock.mockResolvedValue(status);

    render(<BridgePage />);
    await fillForm();

    await screen.findByTestId("fee-tier-display");
    expect(screen.getByTestId("top-tier-message")).toBeInTheDocument();
    expect(screen.queryByTestId("tier-progress")).not.toBeInTheDocument();
  });
});
