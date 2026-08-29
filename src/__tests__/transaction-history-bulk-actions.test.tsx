// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import TransactionHistory, { buildTransactionsCsv } from "@/components/transaction-history";
import type { BridgeTransactionData } from "@/lib/types";

/**
 * Bulk actions on transaction history (#486).
 *
 * The interesting case throughout is a *mixed* selection: some selected rows
 * are eligible for a given bulk action and some are not. Claim is only
 * eligible for confirmed G -> C bridge transactions (see isClaimEligible in
 * the component) — a pending bridge has no funds on the C side yet, and
 * fiat/CEX withdrawals aren't claimable timelocks at all.
 */

afterEach(cleanup);

const CLAIMABLE: BridgeTransactionData = {
  id: "claimable-1",
  fromAddress: "GABC",
  toAddress: "CABC",
  amount: "10",
  asset: "XLM",
  status: "confirmed",
  timestamp: 1_700_000_000_000,
  type: "g-to-c",
  hash: "hash-claimable-1",
};

const CLAIMABLE_2: BridgeTransactionData = {
  ...CLAIMABLE,
  id: "claimable-2",
  amount: "20",
  hash: "hash-claimable-2",
};

const PENDING_BRIDGE: BridgeTransactionData = {
  id: "pending-bridge",
  fromAddress: "GABC",
  toAddress: "CABC",
  amount: "5",
  asset: "XLM",
  status: "pending",
  timestamp: 1_700_000_100_000,
  type: "g-to-c",
};

const CEX_WITHDRAWAL: BridgeTransactionData = {
  id: "cex-1",
  fromAddress: "GABC",
  toAddress: "CABC",
  amount: "1",
  asset: "USDC",
  status: "confirmed",
  timestamp: 1_700_000_200_000,
  type: "cex",
};

const FAILED_FIAT: BridgeTransactionData = {
  id: "fiat-failed",
  fromAddress: "GABC",
  toAddress: "CABC",
  amount: "1",
  asset: "USDC",
  status: "failed",
  timestamp: 1_700_000_300_000,
  type: "fiat",
};

const ALL_TX = [CLAIMABLE, CLAIMABLE_2, PENDING_BRIDGE, CEX_WITHDRAWAL, FAILED_FIAT];

function rowCheckbox(tx: BridgeTransactionData): HTMLElement {
  return screen.getByRole("checkbox", { name: new RegExp(`Select .*${tx.amount} ${tx.asset}`) });
}

describe("bulk row selection", () => {
  it("selects individual rows and shows a running count", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    expect(screen.queryByTestId("selection-count")).toBeNull();

    fireEvent.click(rowCheckbox(CLAIMABLE));
    expect(screen.getByTestId("selection-count").textContent).toBe("1 selected");

    fireEvent.click(rowCheckbox(CEX_WITHDRAWAL));
    expect(screen.getByTestId("selection-count").textContent).toBe("2 selected");

    fireEvent.click(screen.getByText("Clear selection"));
    expect(screen.queryByTestId("selection-count")).toBeNull();
  });

  it("select-all only affects the currently filtered rows", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "confirmed" } });

    // Confirmed rows: CLAIMABLE, CLAIMABLE_2, CEX_WITHDRAWAL (3 of 5 total).
    const selectAll = screen.getByLabelText(/Select all 3 filtered/i);
    fireEvent.click(selectAll);
    expect(screen.getByTestId("selection-count").textContent).toBe("3 selected");

    // Pending/failed rows were never shown, so they must not have been selected.
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "all" } });
    expect(rowCheckbox(PENDING_BRIDGE)).not.toBeChecked();
    expect(rowCheckbox(FAILED_FIAT)).not.toBeChecked();
    expect(rowCheckbox(CLAIMABLE)).toBeChecked();
  });

  it("respects an active text search when selecting all", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "USDC" } });
    // USDC rows: CEX_WITHDRAWAL, FAILED_FIAT.
    fireEvent.click(screen.getByLabelText(/Select all 2 filtered/i));
    expect(screen.getByTestId("selection-count").textContent).toBe("2 selected");
  });
});

describe("bulk export (mixed eligibility)", () => {
  it("stays enabled for a mixed selection since export applies to every row", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(rowCheckbox(PENDING_BRIDGE));
    fireEvent.click(rowCheckbox(FAILED_FIAT));

    const exportButton = screen.getByRole("button", { name: /Export/i });
    expect(exportButton).not.toBeDisabled();

    fireEvent.click(exportButton);
    expect(screen.getByText("Exported 3 transactions.")).toBeInTheDocument();
  });

  it("builds CSV content for the selected rows only", () => {
    const csv = buildTransactionsCsv([CLAIMABLE, CEX_WITHDRAWAL]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,type,status,amount,asset,toAddress,hash,timestamp");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("claimable-1");
    expect(lines[2]).toContain("cex-1");
  });
});

describe("bulk claim (mixed eligibility)", () => {
  it("disables claim and explains why when only some selected rows are eligible", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    // One eligible (confirmed g-to-c) + one ineligible (pending g-to-c).
    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(rowCheckbox(PENDING_BRIDGE));

    const claimButton = screen.getByRole("button", { name: /Claim/i });
    expect(claimButton).toBeDisabled();
    expect(
      screen.getByText(/1 of 2 selected transactions can't be claimed/i)
    ).toBeInTheDocument();

    // Clicking a disabled button must not open the confirmation dialog.
    fireEvent.click(claimButton);
    expect(screen.queryByTestId("bulk-claim-dialog")).toBeNull();
  });

  it("enables claim once every selected row is eligible, and requires confirmation before it acts", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(rowCheckbox(CLAIMABLE_2));

    const claimButton = screen.getByRole("button", { name: /Claim/i });
    expect(claimButton).not.toBeDisabled();

    fireEvent.click(claimButton);
    const dialog = screen.getByTestId("bulk-claim-dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/claims 2 transactions/i)).toBeInTheDocument();

    // No funds should move until the user explicitly confirms.
    expect(screen.queryByText(/^Claimed/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm claim" }));

    expect(screen.queryByTestId("bulk-claim-dialog")).toBeNull();
    expect(screen.getByText("Claimed 2 transactions.")).toBeInTheDocument();
    // Claimed rows are cleared from the selection afterward.
    expect(screen.queryByTestId("selection-count")).toBeNull();
  });

  it("cancelling the confirmation dialog performs no action", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(screen.getByRole("button", { name: /Claim/i }));

    const dialog = screen.getByTestId("bulk-claim-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByTestId("bulk-claim-dialog")).toBeNull();
    expect(screen.queryByText(/^Claimed/)).toBeNull();
    // Selection is untouched by cancelling.
    expect(screen.getByTestId("selection-count").textContent).toBe("1 selected");
  });

  it("closes the confirmation dialog on Escape without acting", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(screen.getByRole("button", { name: /Claim/i }));

    fireEvent.keyDown(screen.getByTestId("bulk-claim-dialog"), { key: "Escape" });

    expect(screen.queryByTestId("bulk-claim-dialog")).toBeNull();
    expect(screen.queryByText(/^Claimed/)).toBeNull();
  });
});
