// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Navbar from "@/components/navbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/bridge",
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type MockWalletValue = {
  isConnected: boolean;
  address: string | null;
  network: "PUBLIC" | "TESTNET";
  networkStatus: "PUBLIC" | "TESTNET" | "UNSUPPORTED" | "UNKNOWN";
  walletNetworkName: string | null;
  isNetworkSupported: boolean;
  networkMismatch: boolean;
  dismissNetworkMismatch: () => void;
  switchNetwork: (...args: unknown[]) => Promise<unknown>;
  connect: () => void;
  disconnect: () => void;
  isConnecting: boolean;
};

const mockSwitchNetwork = vi.fn<(...args: unknown[]) => Promise<unknown>>();

const mockUseWallet = vi.fn<() => MockWalletValue>(() => ({
  isConnected: false,
  address: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnecting: false,
  network: "TESTNET",
  networkStatus: "TESTNET",
  walletNetworkName: "TESTNET",
  isNetworkSupported: true,
  networkMismatch: false,
  dismissNetworkMismatch: vi.fn(),
  switchNetwork: mockSwitchNetwork,
}));

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => mockUseWallet(),
}));

function setNetworkState(overrides: Partial<MockWalletValue>) {
  mockUseWallet.mockReturnValue({
    isConnected: true,
    address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    network: "TESTNET",
    networkStatus: "TESTNET",
    walletNetworkName: "TESTNET",
    isNetworkSupported: true,
    networkMismatch: false,
    dismissNetworkMismatch: vi.fn(),
    switchNetwork: mockSwitchNetwork,
    ...overrides,
  });
}

describe("Navbar persistent network indicator (#480)", () => {
  beforeEach(() => {
    mockSwitchNetwork.mockReset();
    setNetworkState({});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the indicator when connected on mainnet", async () => {
    setNetworkState({ networkStatus: "PUBLIC", network: "PUBLIC", walletNetworkName: "PUBLIC" });
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByRole("button", { name: /Network: Mainnet\. Change network/i })).not.toBeNull();
  });

  it("shows a visually distinct indicator on testnet", async () => {
    setNetworkState({ networkStatus: "TESTNET", walletNetworkName: "TESTNET" });
    await act(async () => {
      render(<Navbar />);
    });
    const button = screen.getByRole("button", { name: /Network: Testnet\. Change network/i });
    expect(button.textContent).toContain("Testnet");
    expect(button.className).toContain("yellow");
  });

  it("names an unsupported network instead of pretending it is testnet", async () => {
    setNetworkState({
      networkStatus: "UNSUPPORTED",
      walletNetworkName: "FUTURENET",
      isNetworkSupported: false,
    });
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByRole("button", { name: /Network: Futurenet\. Change network/i })).not.toBeNull();
  });

  it("labels an unreadable network as Unknown", async () => {
    setNetworkState({
      networkStatus: "UNKNOWN",
      walletNetworkName: null,
      isNetworkSupported: false,
    });
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByRole("button", { name: /Network: Unknown\. Change network/i })).not.toBeNull();
  });

  it("keeps the indicator visible when disconnected", async () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      address: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnecting: false,
      network: "TESTNET",
      networkStatus: "TESTNET",
      walletNetworkName: "TESTNET",
      isNetworkSupported: true,
      networkMismatch: false,
      dismissNetworkMismatch: vi.fn(),
      switchNetwork: mockSwitchNetwork,
    });
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByRole("button", { name: /Network: Testnet\. Change network/i })).not.toBeNull();
  });
});

describe("Navbar network switcher (#480)", () => {
  beforeEach(() => {
    mockSwitchNetwork.mockReset();
    setNetworkState({});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens a menu offering Testnet and Mainnet", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Network: Testnet\. Change network/i }));

    expect(screen.getByRole("menu", { name: /switch network/i })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /Mainnet/ })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /Testnet/ })).not.toBeNull();
  });

  it("marks the current network as Current and disables it", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Network: Testnet\. Change network/i }));

    const testnet = screen.getByRole("menuitem", { name: /Testnet/ });
    expect(testnet.getAttribute("aria-disabled")).toBeNull(); // disabled via attribute
    expect(testnet.hasAttribute("disabled")).toBe(true);
    expect(testnet.textContent).toContain("Current");
    expect(screen.getByRole("menuitem", { name: /Mainnet/ }).hasAttribute("disabled")).toBe(false);
  });

  it("requests the switch through the wallet when another network is chosen", async () => {
    mockSwitchNetwork.mockResolvedValue("switched");
    setNetworkState({ networkStatus: "PUBLIC", network: "PUBLIC", walletNetworkName: "PUBLIC" });
    await act(async () => {
      render(<Navbar />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Network: Mainnet\. Change network/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Testnet/ }));

    expect(mockSwitchNetwork).toHaveBeenCalledWith("TESTNET");
  });

  it("explains how to switch manually when the wallet has no switch API", async () => {
    mockSwitchNetwork.mockResolvedValue("manual");
    setNetworkState({ networkStatus: "PUBLIC", network: "PUBLIC", walletNetworkName: "PUBLIC" });
    await act(async () => {
      render(<Navbar />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Network: Mainnet\. Change network/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Testnet/ }));
    });

    expect(screen.getByRole("status").textContent).toMatch(/Change the network in Freighter/i);
  });

  it("reports a cancelled wallet prompt", async () => {
    mockSwitchNetwork.mockResolvedValue("cancelled");
    setNetworkState({ networkStatus: "PUBLIC", network: "PUBLIC", walletNetworkName: "PUBLIC" });
    await act(async () => {
      render(<Navbar />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Network: Mainnet\. Change network/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Testnet/ }));
    });

    expect(screen.getByRole("status").textContent).toMatch(/cancelled in the wallet/i);
  });
});
