// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const checkConnectionMock = vi.fn<() => Promise<boolean>>();
const getWalletAddressMock = vi.fn<() => Promise<string | null>>();
const getWalletNetworkMock = vi.fn<() => Promise<{ status: "PUBLIC" | "TESTNET" | "UNSUPPORTED" | "UNKNOWN"; name: string | null }>>();
const switchWalletNetworkMock = vi.fn();

vi.mock("@/lib/stellar", () => ({
  connectWallet: vi.fn(),
  checkConnection: () => checkConnectionMock(),
  getWalletAddress: () => getWalletAddressMock(),
  getWalletNetwork: () => getWalletNetworkMock(),
  switchWalletNetwork: (...args: unknown[]) => switchWalletNetworkMock(...args),
  initWalletKit: vi.fn().mockResolvedValue(undefined),
  openWalletSelectionModal: vi.fn(),
}));

import { WalletProvider, useWallet } from "@/components/wallet-provider";

function NetworkProbe() {
  const { network, recentlyChangedNetwork, switchNetwork, disconnect } = useWallet();
  return (
    <div>
      <span data-testid="network">{network}</span>
      <span data-testid="recently-changed">{String(recentlyChangedNetwork)}</span>
      <button type="button" onClick={() => void switchNetwork("TESTNET")}>
        Switch to Testnet
      </button>
      <button type="button" onClick={disconnect}>
        Disconnect
      </button>
    </div>
  );
}

describe("WalletProvider network change detection (#950)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    checkConnectionMock.mockResolvedValue(true);
    getWalletAddressMock.mockResolvedValue("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
    getWalletNetworkMock.mockResolvedValue({ status: "PUBLIC", name: "PUBLIC" });
    switchWalletNetworkMock.mockResolvedValue("switched");
  });

  afterEach(() => {
    cleanup();
  });

  it("treats the initial PUBLIC network poll as baseline (recentlyChangedNetwork === false) and flags a subsequent switch to TESTNET", async () => {
    render(
      <WalletProvider>
        <NetworkProbe />
      </WalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("network").textContent).toBe("PUBLIC");
    });
    expect(screen.getByTestId("recently-changed").textContent).toBe("false");

    // Simulate the wallet switching to TESTNET on the next read
    getWalletNetworkMock.mockResolvedValue({ status: "TESTNET", name: "TESTNET" });
    fireEvent.click(screen.getByRole("button", { name: "Switch to Testnet" }));

    await waitFor(() => {
      expect(screen.getByTestId("network").textContent).toBe("TESTNET");
    });
    expect(screen.getByTestId("recently-changed").textContent).toBe("true");

    // Disconnecting clears the baseline so a future reconnect won't falsely trigger
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByTestId("recently-changed").textContent).toBe("false");
  });
});