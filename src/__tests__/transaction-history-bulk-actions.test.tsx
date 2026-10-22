// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import TransactionHistory, { buildTransactionsCsv } from "@/components/transaction-history";
import type { BridgeTransactionData } from "@/lib/types";

/**
 * Bulk actions on transaction history (#486, #919).
 *
 * Key invariants:
 * - Without an `onClaim` prop the Claim button is hidden entirely — no fake
 *   success messages (#919).
 * - With `onClaim` wired, the button is shown, requires confirmation, calls
 *   the handler with the selected IDs, and surfaces failures inline.
 */

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

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
  const typeLabel = {
    "g-to-c": "G → C Bridge",
    fiat: "Fiat Onramp",
    cex: "CEX Withdrawal",
  }[tx.type];
  return screen.getByRole("checkbox", {
    name: `Select ${typeLabel} of ${tx.amount} ${tx.asset}`,
  });
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

  it("respects an active text search when selecting all", async () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "USDC" } });
    // USDC rows: CEX_WITHDRAWAL, FAILED_FIAT.
    fireEvent.click(await screen.findByLabelText(/Select all 2 filtered/i));
    expect(screen.getByTestId("selection-count").textContent).toBe("2 selected");
  });
});

describe("bulk export (mixed eligibility)", () => {
  it("stays enabled for a mixed selection since export applies to every row", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(rowCheckbox(PENDING_BRIDGE));
    fireEvent.click(rowCheckbox(FAILED_FIAT));

    const exportButton = screen.getByTestId("bulk-export-button");
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

describe("bulk claim — no onClaim prop (not yet wired)", () => {
  it("hides the Claim button entirely when onClaim is not provided (#919)", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);

    fireEvent.click(rowCheckbox(CLAIMABLE));

    // Export should still appear, but Claim must not.
    expect(screen.getByTestId("bulk-export-button")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim/i })).toBeNull();
  });

  it("never opens a confirmation dialog when Claim button is absent", () => {
    render(<TransactionHistory transactions={ALL_TX} loading={false} network="TESTNET" />);
    fireEvent.click(rowCheckbox(CLAIMABLE));
    expect(screen.queryByTestId("bulk-claim-dialog")).toBeNull();
  });
});

describe("bulk claim — onClaim prop wired (#919)", () => {
  it("disables claim and explains why when only some selected rows are eligible", () => {
    render(
      <TransactionHistory
        transactions={ALL_TX}
        loading={false}
        network="TESTNET"
        onClaim={vi.fn()}
      />
    );

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

  it("calls onClaim with selected IDs after confirmation and reports success", async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    render(
      <TransactionHistory
        transactions={ALL_TX}
        loading={false}
        network="TESTNET"
        onClaim={onClaim}
      />
    );

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
    expect(onClaim).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm claim" }));

    await waitFor(() => {
      expect(onClaim).toHaveBeenCalledWith(["claimable-1", "claimable-2"]);
    });

    expect(await screen.findByText("Claimed 2 transactions.")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-claim-dialog")).toBeNull();
    // Claimed rows are cleared from the selection afterward.
    expect(screen.queryByTestId("selection-count")).toBeNull();
  });

  it("surfaces the error inline when onClaim rejects, keeping the dialog open", async () => {
    const onClaim = vi.fn().mockRejectedValue(new Error("Wallet rejected signature"));
    render(
      <TransactionHistory
        transactions={ALL_TX}
        loading={false}
        network="TESTNET"
        onClaim={onClaim}
      />
    );

    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(screen.getByRole("button", { name: /Claim/i }));
    fireEvent.click(within(screen.getByTestId("bulk-claim-dialog")).getByRole("button", { name: "Confirm claim" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wallet rejected signature");
    // Dialog stays open so the user can retry or cancel.
    expect(screen.getByTestId("bulk-claim-dialog")).toBeInTheDocument();
    // No success message was announced.
    expect(screen.queryByText(/^Claimed/)).toBeNull();
  });

  it("cancelling the confirmation dialog performs no action", () => {
    render(
      <TransactionHistory
        transactions={ALL_TX}
        loading={false}
        network="TESTNET"
        onClaim={vi.fn()}
      />
    );

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
    render(
      <TransactionHistory
        transactions={ALL_TX}
        loading={false}
        network="TESTNET"
        onClaim={vi.fn()}
      />
    );

    fireEvent.click(rowCheckbox(CLAIMABLE));
    fireEvent.click(screen.getByRole("button", { name: /Claim/i }));

    fireEvent.keyDown(screen.getByTestId("bulk-claim-dialog"), { key: "Escape" });

    expect(screen.queryByTestId("bulk-claim-dialog")).toBeNull();
    expect(screen.queryByText(/^Claimed/)).toBeNull();
  });
});
