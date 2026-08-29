// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BridgePage from "@/app/bridge/page";

/**
 * Tests for the optional lock/unlock-date add-on to the funding form (#467).
 *
 * src/lib/stellar ships stubbed (throwing) function bodies from an unrelated
 * seed commit — mocked here the same way `bridge-flow-a11y.test.tsx` does, so
 * the page can render and the lock-specific branches (which don't touch
 * stellar.ts at all) are what's actually under test.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALID_C_ADDRESS = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
// vi.mock factories are hoisted above this file's other top-level statements,
// so the address they close over must be too (plain top-level consts would
// hit the TDZ) — see vi.hoisted's own docs for why.
const FROM_ADDRESS = vi.hoisted(() => "G" + "A".repeat(55));

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
}));

const createLockMock = vi.fn();
vi.mock("@/lib/api", () => ({
  createLock: (...args: unknown[]) => createLockMock(...args),
}));

async function fillForm() {
  fireEvent.change(screen.getByLabelText(/To \(C-address\)/i), { target: { value: VALID_C_ADDRESS } });
  fireEvent.change(screen.getByLabelText(/^Amount$/i), { target: { value: "10" } });
  await waitFor(() => expect(screen.getByTestId("lock-toggle")).toBeInTheDocument());
}

function futureDatetimeLocal(msFromNow: number): string {
  const d = new Date(Date.now() + msFromNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe("Bridge form — lock option (#467)", () => {
  afterEach(() => {
    createLockMock.mockReset();
    vi.restoreAllMocks();
  });

  it("hides the unlock date/time input until the lock toggle is checked", async () => {
    render(<BridgePage />);
    await waitFor(() => expect(screen.getByTestId("lock-toggle")).toBeInTheDocument());

    expect(screen.queryByLabelText(/Unlock date/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("lock-toggle"));
    expect(screen.getByLabelText(/Unlock date/i)).toBeInTheDocument();
  });

  it("does not replace instant funding — leaving the toggle unchecked keeps the normal bridging-blocked warning", async () => {
    render(<BridgePage />);
    await fillForm();

    expect(screen.getByText(/G → C bridging isn't live yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review Bridge Transaction/i })).toBeDisabled();
  });

  it("rejects a past unlock time and keeps the submit button disabled", async () => {
    render(<BridgePage />);
    await fillForm();
    fireEvent.click(screen.getByTestId("lock-toggle"));

    fireEvent.change(screen.getByLabelText(/Unlock date/i), { target: { value: "2020-01-01T00:00" } });

    expect(await screen.findByText(/must be in the future/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review Locked Transfer/i })).toBeDisabled();
  });

  it("bypasses the #284 instant-bridging block once locked with a valid future date", async () => {
    render(<BridgePage />);
    await fillForm();
    fireEvent.click(screen.getByTestId("lock-toggle"));
    fireEvent.change(screen.getByLabelText(/Unlock date/i), { target: { value: futureDatetimeLocal(3_600_000) } });

    expect(screen.queryByText(/G → C bridging isn't live yet/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Review Locked Transfer/i })).toBeEnabled();
    });
  });

  it("submits a locked transfer via createLock and shows the locked confirmation", async () => {
    const unlockTime = Date.now() + 3_600_000;
    createLockMock.mockResolvedValue({
      id: "lock-1",
      sender: FROM_ADDRESS,
      recipient: VALID_C_ADDRESS,
      amount: "10",
      asset: "XLM",
      unlockTime,
      status: "pending",
      createdAt: Date.now(),
      network: "TESTNET",
    });

    render(<BridgePage />);
    await fillForm();
    fireEvent.click(screen.getByTestId("lock-toggle"));
    fireEvent.change(screen.getByLabelText(/Unlock date/i), { target: { value: futureDatetimeLocal(3_600_000) } });

    await waitFor(() => expect(screen.getByRole("button", { name: /Review Locked Transfer/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Review Locked Transfer/i }));

    expect(await screen.findByText("Unlocks")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirm & Lock/i }));
    });

    expect(createLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: FROM_ADDRESS,
        recipient: VALID_C_ADDRESS,
        amount: "10",
        asset: "XLM",
        network: "TESTNET",
      })
    );
    expect(await screen.findByText("Transfer Locked")).toBeInTheDocument();
  });

  it("shows an error and stays recoverable when lock creation fails", async () => {
    createLockMock.mockRejectedValue(new Error("Lock creation failed. Please try again."));

    render(<BridgePage />);
    await fillForm();
    fireEvent.click(screen.getByTestId("lock-toggle"));
    fireEvent.change(screen.getByLabelText(/Unlock date/i), { target: { value: futureDatetimeLocal(3_600_000) } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Review Locked Transfer/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Review Locked Transfer/i }));
    await screen.findByText("Unlocks");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirm & Lock/i }));
    });

    expect(await screen.findByText("Transaction Failed")).toBeInTheDocument();
    expect(screen.getByText("Lock creation failed. Please try again.")).toBeInTheDocument();
  });
});
