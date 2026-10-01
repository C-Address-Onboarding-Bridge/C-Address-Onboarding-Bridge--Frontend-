// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BridgePage from "@/app/bridge/page";
import {
  isMainnetSessionConfirmed,
  setMainnetSessionConfirmed,
  clearMainnetSessionConfirmed,
  MAINNET_SESSION_STORAGE_KEY,
} from "@/lib/session";

/**
 * Tests for one-per-session mainnet confirmation (#759).
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALID_C_ADDRESS = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const FROM_ADDRESS = vi.hoisted(() => "G" + "A".repeat(55));

let mockNetwork = "PUBLIC";
let mockRecentlyChanged = false;

vi.mock("@/contexts/FeatureFlagContext", () => ({
  useFeatureFlag: () => true, // enable lock option to bypass instant bridge block
}));

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => ({
    isConnected: true,
    address: FROM_ADDRESS,
    network: mockNetwork,
    networkStatus: mockNetwork,
    walletNetworkName: mockNetwork === "PUBLIC" ? "Mainnet" : "Testnet",
    isNetworkSupported: true,
    isOnline: true,
    recentlyChangedNetwork: mockRecentlyChanged,
    connect: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: unknown) => value,
}));

const mockSign = vi.fn().mockResolvedValue("stub-signed-xdr");
const mockCreateLock = vi.fn().mockResolvedValue({
  id: "lock-1",
  sender: FROM_ADDRESS,
  recipient: VALID_C_ADDRESS,
  amount: "10",
  asset: "XLM",
  unlockTime: Date.now() + 3_600_000,
  status: "pending",
  createdAt: Date.now(),
  network: "PUBLIC",
});

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    isValidStellarAddress: (a: string) => /^[GC][A-Z0-9]{55}$/.test(a),
    isCAddress: (a: string) => /^C[A-Z0-9]{55}$/.test(a),
    isValidStellarAmount: (a: string) => /^\d+(\.\d{1,7})?$/.test(a),
    formatNetworkLabel: () => (mockNetwork === "PUBLIC" ? "Mainnet" : "Testnet"),
    bridgeViaContract: vi.fn(),
    getExplorerUrl: () => "https://stellar.expert",
    getAccountBalances: vi.fn().mockResolvedValue({
      total: "100",
      balances: [{ asset: "XLM", amount: "100" }],
    }),
    getAccountMinimumBalance: () => "1",
    getEstimatedFeeXLM: vi.fn().mockResolvedValue("~0.00001 XLM"),
    toSafeErrorMessage: (_e: unknown, fallback: string) => fallback,
    assertActiveAccountMatches: vi.fn().mockResolvedValue(undefined),
    signPreparedTransaction: (...args: unknown[]) => mockSign(...args),
  };
});

vi.mock("@/lib/api", () => ({
  createLock: (...args: unknown[]) => mockCreateLock(...args),
  getFeeTierPreview: () => Promise.resolve(null),
  prepareBatchFunding: () => Promise.resolve({ xdr: "stub-xdr" }),
  submitSignedBatchFunding: () => Promise.resolve({ results: [] }),
}));

function futureDatetimeLocal(msFromNow: number): string {
  const d = new Date(Date.now() + msFromNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fillAndGoToReview() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/To \(C-address\)/i), { target: { value: VALID_C_ADDRESS } });
    fireEvent.change(screen.getByLabelText(/^Amount$/i), { target: { value: "10" } });
  });
  await waitFor(() => expect(screen.getByTestId("lock-toggle")).toBeInTheDocument());

  await act(async () => {
    fireEvent.click(screen.getByTestId("lock-toggle"));
    fireEvent.change(screen.getByLabelText(/Unlock date/i), { target: { value: futureDatetimeLocal(3_600_000) } });
  });

  await waitFor(() => expect(screen.getByRole("button", { name: /Review Locked Transfer/i })).toBeEnabled());
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Review Locked Transfer/i }));
  });
}

describe("One-per-session mainnet confirmation (#759)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearMainnetSessionConfirmed();
    mockNetwork = "PUBLIC";
    mockRecentlyChanged = false;
    mockSign.mockClear();
    mockCreateLock.mockClear();

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/simulate") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            feeStroops: "100",
            feeXlm: "0.00001 XLM",
            netAmount: "9.99999",
            grossAmount: "10",
            asset: "XLM",
            recipient: VALID_C_ADDRESS,
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });
  });

  afterEach(() => {
    clearMainnetSessionConfirmed();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("session storage helper functions work correctly", () => {
    expect(isMainnetSessionConfirmed()).toBe(false);
    setMainnetSessionConfirmed(true);
    expect(isMainnetSessionConfirmed()).toBe(true);
    expect(window.sessionStorage.getItem(MAINNET_SESSION_STORAGE_KEY)).toBe("true");
    clearMainnetSessionConfirmed();
    expect(isMainnetSessionConfirmed()).toBe(false);
  });

  it("requires explicit confirmation for a mainnet action even without a recent network switch", async () => {
    mockNetwork = "PUBLIC";
    mockRecentlyChanged = false; // User opened app already on mainnet!

    render(<BridgePage />);
    await fillAndGoToReview();

    // Confirm button is visible on the review screen
    const confirmBtn = await screen.findByRole("button", { name: /Confirm & Lock/i });
    expect(confirmBtn).toBeInTheDocument();

    // Clicking confirm prompts the mainnet warning because session is not yet confirmed
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    const warning = await screen.findByTestId("mainnet-warning");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/This transaction will send real funds on Mainnet/i);
    expect(mockCreateLock).not.toHaveBeenCalled();

    // User clicks "I understand — continue on Mainnet"
    const acceptBtn = screen.getByTestId("confirm-mainnet-warning");
    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    // Session is now marked confirmed and transaction proceeds
    await waitFor(() => {
      expect(mockCreateLock).toHaveBeenCalled();
    });
    expect(isMainnetSessionConfirmed()).toBe(true);
  });

  it("does not warn again for subsequent mainnet actions once session is confirmed", async () => {
    mockNetwork = "PUBLIC";
    mockRecentlyChanged = false;
    setMainnetSessionConfirmed(true); // Session already confirmed

    render(<BridgePage />);
    await fillAndGoToReview();

    const confirmBtn = await screen.findByRole("button", { name: /Confirm & Lock/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    // Directly executes without warning prompt
    expect(screen.queryByTestId("mainnet-warning")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockCreateLock).toHaveBeenCalled();
    });
  });

  it("does not warn on testnet even when session is unconfirmed", async () => {
    mockNetwork = "TESTNET";
    mockRecentlyChanged = false;

    render(<BridgePage />);
    await fillAndGoToReview();

    const confirmBtn = await screen.findByRole("button", { name: /Confirm & Lock/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(screen.queryByTestId("mainnet-warning")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockCreateLock).toHaveBeenCalled();
    });
  });
});
