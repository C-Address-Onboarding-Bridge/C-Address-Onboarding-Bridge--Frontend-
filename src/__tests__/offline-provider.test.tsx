// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { WalletProvider, useWallet } from "@/components/wallet-provider";

// The provider calls these on mount via its connection poller; provide no-ops
// so the offline behaviour under test is the only thing exercised. (#475)
vi.mock("@/lib/stellar", () => ({
  connectWallet: vi.fn(),
  checkConnection: vi.fn().mockResolvedValue(false),
  getWalletAddress: vi.fn().mockResolvedValue(null),
  getWalletNetwork: vi.fn().mockResolvedValue({ status: "TESTNET", name: "Testnet" }),
  initWalletKit: vi.fn().mockResolvedValue(undefined),
  openWalletSelectionModal: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/session", () => ({
  loadSession: () => ({ manuallyDisconnected: false }),
  markConnected: vi.fn(),
  markDisconnected: vi.fn(),
}));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

function captureApi() {
  let api: ReturnType<typeof useWallet> | null = null;
  function Consumer() {
    api = useWallet();
    return null;
  }
  return { Consumer, getApi: () => api! };
}

describe("WalletProvider offline behaviour (#475)", () => {
  const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine");

  beforeEach(() => {
    setOnline(true);
  });

  afterEach(() => {
    if (originalOnline) Object.defineProperty(navigator, "onLine", originalOnline);
    vi.restoreAllMocks();
  });

  it("detects going offline and reports it", async () => {
    const { Consumer, getApi } = captureApi();
    render(<WalletProvider><Consumer /></WalletProvider>);

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    expect(getApi().isOnline).toBe(false);
  });

  it("queues a safe op while offline and replays it on reconnect", async () => {
    const { Consumer, getApi } = captureApi();
    render(<WalletProvider><Consumer /></WalletProvider>);

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    const run = vi.fn().mockResolvedValue(undefined);
    let id = "";
    await act(async () => {
      id = getApi().enqueueOperation({ label: "refresh", kind: "safe", run });
    });
    expect(getApi().pendingOperations.some((o) => o.id === id)).toBe(true);

    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(getApi().pendingOperations.some((o) => o.id === id)).toBe(false);
  });

  it("cancels a queued operation", async () => {
    const { Consumer, getApi } = captureApi();
    render(<WalletProvider><Consumer /></WalletProvider>);

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    const id = getApi().enqueueOperation({ label: "refresh", kind: "safe", run: vi.fn() });
    await act(async () => {
      getApi().cancelOperation(id);
    });

    expect(getApi().pendingOperations.some((o) => o.id === id)).toBe(false);
  });

  it("never blind-replays funding ops, but confirms them on request", async () => {
    const { Consumer, getApi } = captureApi();
    render(<WalletProvider><Consumer /></WalletProvider>);

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    const run = vi.fn().mockResolvedValue(undefined);
    const id = getApi().enqueueOperation({ label: "fund", kind: "funding", run });

    // Reconnect: funding must stay put, not auto-sent.
    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(run).not.toHaveBeenCalled();
    expect(getApi().pendingOperations.some((o) => o.id === id)).toBe(true);

    await act(async () => {
      await getApi().confirmFunding();
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(getApi().pendingOperations.some((o) => o.id === id)).toBe(false);
  });
});
