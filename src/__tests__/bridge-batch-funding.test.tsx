// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BridgePage from "@/app/bridge/page";

/**
 * Tests for batch funding's prepare → sign → submit flow (#671).
 *
 * Batch funding invokes the contract's batch_fund_c_address, which moves the
 * connected wallet's funds and therefore needs the wallet's signature — the
 * old flow called a nonexistent /batch-fund endpoint with the raw recipient
 * list and never asked the wallet to sign anything. These tests assert the
 * three-step flow now wires correctly: prepareBatchFunding (API) builds the
 * unsigned XDR, signPreparedTransaction (wallet) signs it, and
 * submitSignedBatchFunding (API) submits the signed XDR — in that order,
 * with a mocked wallet and API standing in for the real backend/extension
 * per the issue's own "no additional repo access or secrets needed" scope.
 *
 * Mocked the same way bridge-lock-option.test.tsx and bridge-fee-tier.test.tsx
 * mock @/lib/stellar and @/lib/api, so the page can render and only the
 * batch-submission wiring is under test.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FROM_ADDRESS = vi.hoisted(() => "G" + "A".repeat(55));
const RECIPIENT_1 = "C" + "B".repeat(55);
const RECIPIENT_2 = "C" + "C".repeat(55);

// The lock/claims feature is behind the locked_transfers flag (#672), off by
// default; this file doesn't exercise it, so the mocked value doesn't matter
// beyond satisfying the provider requirement.
vi.mock("@/contexts/FeatureFlagContext", () => ({
  useFeatureFlag: () => false,
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

const assertActiveAccountMatchesMock = vi.fn().mockResolvedValue(undefined);
const signPreparedTransactionMock = vi.fn().mockResolvedValue("signed-xdr");

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
  assertActiveAccountMatches: (...args: unknown[]) => assertActiveAccountMatchesMock(...args),
  signPreparedTransaction: (...args: unknown[]) => signPreparedTransactionMock(...args),
}));

const prepareBatchFundingMock = vi.fn();
const submitSignedBatchFundingMock = vi.fn();

vi.mock("@/lib/api", () => ({
  // See note in bridge-lock-option.test.tsx — the factory must cover every
  // name the bridge page imports from this module.
  getFeeTierPreview: () => Promise.resolve(null),
  createLock: () => Promise.resolve(null),
  prepareBatchFunding: (...args: unknown[]) => prepareBatchFundingMock(...args),
  submitSignedBatchFunding: (...args: unknown[]) => submitSignedBatchFundingMock(...args),
}));

function switchToBatchMode() {
  fireEvent.click(screen.getByTestId("flow-mode-batch"));
}

async function fillAndReviewBatch() {
  switchToBatchMode();
  fireEvent.change(screen.getByTestId("batch-textarea"), {
    target: { value: `${RECIPIENT_1},10\n${RECIPIENT_2},25.5` },
  });
  await waitFor(() => expect(screen.getByTestId("batch-review-button")).toBeEnabled());
  fireEvent.click(screen.getByTestId("batch-review-button"));
  await waitFor(() => expect(screen.getByTestId("batch-submit-button")).toBeInTheDocument());
}

describe("Bridge form — batch funding (#671)", () => {
  afterEach(() => {
    prepareBatchFundingMock.mockReset();
    submitSignedBatchFundingMock.mockReset();
    assertActiveAccountMatchesMock.mockClear();
    signPreparedTransactionMock.mockClear();
    vi.restoreAllMocks();
  });

  it("prepares, signs, and submits in order instead of posting raw recipients to a batch-fund endpoint", async () => {
    prepareBatchFundingMock.mockResolvedValue({ xdr: "unsigned-xdr" });
    signPreparedTransactionMock.mockResolvedValue("signed-xdr");
    submitSignedBatchFundingMock.mockResolvedValue({
      results: [
        { address: RECIPIENT_1, amount: "10", success: true, hash: "abc123" },
        { address: RECIPIENT_2, amount: "25.5", success: true, hash: "def456" },
      ],
    });

    render(<BridgePage />);
    await fillAndReviewBatch();
    fireEvent.click(screen.getByTestId("batch-submit-button"));

    await waitFor(() => expect(screen.getByTestId("batch-results")).toBeInTheDocument());

    expect(assertActiveAccountMatchesMock).toHaveBeenCalledWith(FROM_ADDRESS);
    expect(prepareBatchFundingMock).toHaveBeenCalledWith(
      FROM_ADDRESS,
      [
        { address: RECIPIENT_1, amount: "10" },
        { address: RECIPIENT_2, amount: "25.5" },
      ],
      "TESTNET"
    );
    expect(signPreparedTransactionMock).toHaveBeenCalledWith("unsigned-xdr", "TESTNET");
    expect(submitSignedBatchFundingMock).toHaveBeenCalledWith("signed-xdr", "TESTNET");

    // Call order matters: signing an XDR that was never prepared, or
    // submitting one that was never signed, would both be silent no-ops
    // with mocks — asserting order is what actually catches a reordering.
    const prepareOrder = prepareBatchFundingMock.mock.invocationCallOrder[0];
    const signOrder = signPreparedTransactionMock.mock.invocationCallOrder[0];
    const submitOrder = submitSignedBatchFundingMock.mock.invocationCallOrder[0];
    expect(prepareOrder).toBeLessThan(signOrder);
    expect(signOrder).toBeLessThan(submitOrder);

    expect(screen.getByTestId("batch-results-summary")).toHaveTextContent("2 of 2 recipients succeeded");
  });

  it("shows a recoverable error and never calls the API when the wallet declines to sign", async () => {
    prepareBatchFundingMock.mockResolvedValue({ xdr: "unsigned-xdr" });
    signPreparedTransactionMock.mockRejectedValue(new Error("User declined access"));

    render(<BridgePage />);
    await fillAndReviewBatch();
    fireEvent.click(screen.getByTestId("batch-submit-button"));

    expect(await screen.findByTestId("batch-submit-error")).toHaveTextContent("User declined access");
    expect(submitSignedBatchFundingMock).not.toHaveBeenCalled();
    // Recoverable: the review step (and its submit button) is still there.
    expect(screen.getByTestId("batch-submit-button")).toBeInTheDocument();
  });

  it("surfaces a per-recipient failure from the confirmed transaction without throwing", async () => {
    prepareBatchFundingMock.mockResolvedValue({ xdr: "unsigned-xdr" });
    signPreparedTransactionMock.mockResolvedValue("signed-xdr");
    submitSignedBatchFundingMock.mockResolvedValue({
      results: [
        { address: RECIPIENT_1, amount: "10", success: true, hash: "abc123" },
        { address: RECIPIENT_2, amount: "25.5", success: false, error: "Insufficient balance" },
      ],
    });

    render(<BridgePage />);
    await fillAndReviewBatch();
    fireEvent.click(screen.getByTestId("batch-submit-button"));

    await waitFor(() => expect(screen.getByTestId("batch-results")).toBeInTheDocument());
    expect(screen.getByTestId("batch-results-summary")).toHaveTextContent("1 of 2 recipients succeeded");
  });
});
