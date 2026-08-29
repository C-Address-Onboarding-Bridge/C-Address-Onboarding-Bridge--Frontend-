// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mock useWallet so the bridge page renders without a real wallet context.
vi.mock("@/components/wallet-provider", () => ({
  useWallet: vi.fn(),
}));

// Mock stellar calls that would hit the network.
vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    getAccountBalances: vi.fn().mockResolvedValue({ total: "100", balances: [] }),
    bridgeViaContract: vi.fn().mockRejectedValue(new Error("Bridge not live")),
  };
});

import { useWallet } from "@/components/wallet-provider";
import BridgePage from "@/app/bridge/page";

afterEach(cleanup);

// Known-valid Stellar addresses (pre-computed StrKey values, no runtime generation needed).
// G-address: standard Ed25519 public key
const VALID_G_ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
// C-address: valid Soroban contract StrKey
const VALID_C_ADDRESS = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

function mockWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  (useWallet as ReturnType<typeof vi.fn>).mockReturnValue({
    isConnected: false,
    address: null,
    network: "TESTNET",
    networkStatus: "TESTNET",
    walletNetworkName: "TESTNET",
    isNetworkSupported: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    networkMismatch: false,
    dismissNetworkMismatch: vi.fn(),
    ...overrides,
  });
}

describe("BridgePage — bridging blocked / consent gate", () => {
  it("renders the bridge form heading", () => {
    mockWallet();
    render(<BridgePage />);
    expect(screen.getByRole("heading", { name: /G → C Bridge/i })).not.toBeNull();
  });

  it("shows the unavailability warning when a valid C-address is entered", async () => {
    mockWallet({ isConnected: true, address: VALID_G_ADDRESS });
    render(<BridgePage />);

    const toInput = screen.getByPlaceholderText(/CABC/i);
    fireEvent.change(toInput, { target: { value: VALID_C_ADDRESS } });

    expect(
      await screen.findByText(/G → C bridging isn't live yet/i)
    ).not.toBeNull();
  });

  it("submit button is disabled when bridging is blocked", () => {
    mockWallet({ isConnected: true, address: VALID_G_ADDRESS });
    render(<BridgePage />);

    const toInput = screen.getByPlaceholderText(/CABC/i);
    fireEvent.change(toInput, { target: { value: VALID_C_ADDRESS } });

    const submitBtn = screen.getByRole("button", { name: /Review Bridge Transaction/i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });

  it("submit button is disabled when not connected", () => {
    mockWallet({ isConnected: false });
    render(<BridgePage />);
    const submitBtn = screen.getByRole("button", { name: /Review Bridge Transaction/i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });

  it("no warning shown when the C-address field is empty", () => {
    mockWallet({ isConnected: true, address: VALID_G_ADDRESS });
    render(<BridgePage />);
    expect(screen.queryByText(/bridging isn't live yet/i)).toBeNull();
  });
});
