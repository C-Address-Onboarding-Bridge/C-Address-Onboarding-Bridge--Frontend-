// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BridgePage from "@/app/bridge/page";

/**
 * Tests that the chosen dynamic fee from Horizon fee_stats is displayed on
 * the review screen (#758).
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALID_C_ADDRESS = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const FROM_ADDRESS = vi.hoisted(() => "G" + "A".repeat(55));

vi.mock("@/contexts/FeatureFlagContext", () => ({
  useFeatureFlag: () => true, // enable lock to reach review step
}));

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

let mockRecommendedFeeStr = "~0.00015 XLM";

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    isValidStellarAddress: (a: string) => /^[GC][A-Z0-9]{55}$/.test(a),
    isCAddress: (a: string) => /^C[A-Z0-9]{55}$/.test(a),
    isValidStellarAmount: (a: string) => /^\d+(\.\d{1,7})?$/.test(a),
    formatNetworkLabel: () => "Testnet",
    bridgeViaContract: vi.fn(),
    getExplorerUrl: () => "https://stellar.expert",
    getAccountBalances: vi.fn().mockResolvedValue({
      total: "100",
      balances: [{ asset: "XLM", amount: "100" }],
    }),
    getAccountMinimumBalance: () => "1",
    getEstimatedFeeXLM: vi.fn().mockImplementation(async () => mockRecommendedFeeStr),
    toSafeErrorMessage: (_e: unknown, fallback: string) => fallback,
    assertActiveAccountMatches: vi.fn().mockResolvedValue(undefined),
    signPreparedTransaction: vi.fn().mockResolvedValue("stub-signed-xdr"),
  };
});

vi.mock("@/lib/api", () => ({
  createLock: () => Promise.resolve(null),
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

describe("Bridge review screen — surge pricing fee display (#758)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("displays the surge-priced fee bid on the review screen", async () => {
    mockRecommendedFeeStr = "~0.00015 XLM";

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/simulate") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            feeStroops: "1500",
            feeXlm: "0.00015 XLM",
            netAmount: "9.99985",
            grossAmount: "10",
            asset: "XLM",
            recipient: VALID_C_ADDRESS,
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });

    render(<BridgePage />);
    await fillAndGoToReview();

    const feeEl = await screen.findByTestId("review-fee");
    expect(feeEl).toBeInTheDocument();
    expect(feeEl).toHaveTextContent("~0.00015 XLM");
  });

  it("displays the capped ceiling fee on the review screen under high congestion", async () => {
    mockRecommendedFeeStr = "~0.001 XLM";

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/simulate") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            feeStroops: "10000",
            feeXlm: "0.001 XLM",
            netAmount: "9.999",
            grossAmount: "10",
            asset: "XLM",
            recipient: VALID_C_ADDRESS,
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });

    render(<BridgePage />);
    await fillAndGoToReview();

    const feeEl = await screen.findByTestId("review-fee");
    expect(feeEl).toBeInTheDocument();
    expect(feeEl).toHaveTextContent("~0.001 XLM");
  });
});
