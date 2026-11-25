// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletProvider, useWallet } from "@/components/wallet-provider";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockOpenWalletSelectionResult = vi.fn();
const mockGetWalletNetwork = vi.fn();

vi.mock("@/lib/stellar", () => ({
  openWalletSelectionResult: (...args: unknown[]) => mockOpenWalletSelectionResult(...args),
  checkConnection: vi.fn().mockResolvedValue(false),
  getWalletAddress: vi.fn().mockResolvedValue(null),
  getWalletNetwork: (...args: unknown[]) => mockGetWalletNetwork(...args),
  switchWalletNetwork: vi.fn(),
  initWalletKit: vi.fn().mockResolvedValue(undefined),
}));

function ConnectHarness() {
  const { connect, connectError, isConnected } = useWallet();
  return (
    <div>
      <button onClick={() => void connect()}>Connect Wallet</button>
      <span data-testid="connected">{String(isConnected)}</span>
      {connectError && <div role="alert">{connectError}</div>}
    </div>
  );
}

describe("Wallet connection failure vs cancellation (#948)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("shows no alert when the user dismisses the modal", async () => {
    mockOpenWalletSelectionResult.mockResolvedValueOnce({ status: "cancelled" });

    render(
      <WalletProvider>
        <ConnectHarness />
      </WalletProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Connect Wallet"));
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("connected").textContent).toBe("false");
  });

  it("surfaces a role='alert' error on kit failure and clears it on the next attempt", async () => {
    mockOpenWalletSelectionResult
      .mockResolvedValueOnce({ status: "error", message: "Freighter extension is locked" })
      .mockResolvedValueOnce({ status: "cancelled" });

    render(
      <WalletProvider>
        <ConnectHarness />
      </WalletProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Connect Wallet"));
    });

    expect(screen.getByRole("alert").textContent).toContain("Freighter extension is locked");

    await act(async () => {
      fireEvent.click(screen.getByText("Connect Wallet"));
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});