// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import TransactionHistory from "@/components/transaction-history";
import type { BridgeTransactionData } from "@/lib/types";

const TRANSACTIONS: BridgeTransactionData[] = [
  {
    id: "1",
    fromAddress: "GABC",
    toAddress: "CABC",
    amount: "10",
    asset: "XLM",
    status: "confirmed",
    timestamp: 1_700_000_000_000,
    type: "g-to-c",
    hash: "abc123",
  },
  {
    id: "2",
    fromAddress: "GABC",
    toAddress: "CABC",
    amount: "5",
    asset: "USDC",
    status: "pending",
    timestamp: 1_700_000_100_000,
    type: "cex",
  },
];

describe("TransactionHistory — loading, empty, and populated states (#485)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("announces loading immediately via a status region", () => {
    render(<TransactionHistory transactions={[]} loading network="TESTNET" />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Loading recent transactions");
  });

  it("does not visually show the skeleton before the ~200ms delay elapses (no flash on fast loads)", () => {
    const { container } = render(<TransactionHistory transactions={[]} loading network="TESTNET" />);

    const skeletonWrapper = container.querySelector('[aria-hidden="true"].divide-y');
    expect(skeletonWrapper).not.toBeNull();
    // Present (reserving space) but not yet visible.
    expect(skeletonWrapper?.className).toContain("invisible");
  });

  it("reveals the skeleton once the loading delay elapses", () => {
    const { container } = render(<TransactionHistory transactions={[]} loading network="TESTNET" />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    const skeletonWrapper = container.querySelector('[aria-hidden="true"].divide-y');
    expect(skeletonWrapper?.className).not.toContain("invisible");
  });

  it("never reveals the skeleton if loading finishes before the delay (fast load)", () => {
    const { container, rerender } = render(
      <TransactionHistory transactions={[]} loading network="TESTNET" />
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(<TransactionHistory transactions={[]} loading={false} network="TESTNET" />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Loading state (and its skeleton) is gone entirely — replaced by the
    // empty state, not a skeleton that briefly flashed.
    expect(container.querySelector('[aria-hidden="true"].divide-y')).toBeNull();
    expect(screen.getByText(/No transactions found/i)).not.toBeNull();
  });

  it("shows a distinct empty state (not a spinner/skeleton) once loading finishes with no data", () => {
    render(<TransactionHistory transactions={[]} loading={false} network="TESTNET" />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/No transactions found for this account/i)).not.toBeNull();
  });

  it("renders every populated transaction once loading finishes with data", () => {
    render(<TransactionHistory transactions={TRANSACTIONS} loading={false} network="TESTNET" address="GABC" />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/No transactions found/i)).toBeNull();
    expect(screen.getByText("G → C Bridge")).not.toBeNull();
    expect(screen.getByText("CEX Withdrawal")).not.toBeNull();
  });
});
