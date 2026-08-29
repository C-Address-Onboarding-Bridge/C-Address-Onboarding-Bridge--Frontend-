// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ClaimsPanel from "../claims-panel";
import type { Lock } from "@/lib/locks";

/**
 * Unit tests for ClaimsPanel (#467).
 *
 * `@/lib/api`'s lock routes are a placeholder interface (see `src/lib/locks.ts`
 * and `src/lib/api.ts`) — mocked here the same way the rest of this repo mocks
 * unimplemented/external dependencies (e.g. `bridge-flow-a11y.test.tsx` mocking
 * `@/lib/stellar`), so the panel's own polling/claim/countdown logic is what's
 * under test, not a real network call.
 */

const { listIncomingLocksMock, claimLockMock } = vi.hoisted(() => ({
  listIncomingLocksMock: vi.fn(),
  claimLockMock: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listIncomingLocks: listIncomingLocksMock,
    claimLock: claimLockMock,
  };
});

const ADDRESS = "GRECIPIENT00000000000000000000000000000000000000000000";

const makeLock = (overrides: Partial<Lock> = {}): Lock => ({
  id: "lock-1",
  sender: "GSENDER00000000000000000000000000000000000000000000000",
  recipient: ADDRESS,
  amount: "100",
  asset: "XLM",
  unlockTime: Date.now() + 60_000,
  status: "pending",
  createdAt: Date.now() - 60_000,
  network: "TESTNET",
  ...overrides,
});

describe("ClaimsPanel (#467)", () => {
  beforeEach(() => {
    listIncomingLocksMock.mockReset();
    claimLockMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing without a connected address", () => {
    const { container } = render(<ClaimsPanel address={null} network="TESTNET" isNetworkSupported={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an empty state when there are no incoming locks", async () => {
    listIncomingLocksMock.mockResolvedValue([]);
    render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);

    expect(await screen.findByText(/no locked transfers/i)).toBeInTheDocument();
  });

  describe("lock state: not yet matured", () => {
    it("shows a countdown and no claim action", async () => {
      const lock = makeLock({ unlockTime: Date.now() + 90_000 });
      listIncomingLocksMock.mockResolvedValue([lock]);

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);

      await screen.findByTestId(`lock-row-${lock.id}`);
      expect(screen.getByTestId(`lock-countdown-${lock.id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`claim-button-${lock.id}`)).not.toBeInTheDocument();
    });

    it("counts down live and becomes claimable once matured", async () => {
      vi.useFakeTimers();
      const lock = makeLock({ unlockTime: Date.now() + 3_000 });
      listIncomingLocksMock.mockResolvedValue([lock]);

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      await vi.waitFor(() => expect(screen.getByTestId(`lock-countdown-${lock.id}`)).toHaveTextContent("3s"));

      await vi.advanceTimersByTimeAsync(3_000);

      expect(screen.queryByTestId(`lock-countdown-${lock.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`claim-button-${lock.id}`)).toBeInTheDocument();
    });
  });

  describe("lock state: matured and unclaimed (claimable)", () => {
    it("shows a claim action", async () => {
      const lock = makeLock({ unlockTime: Date.now() - 1_000 });
      listIncomingLocksMock.mockResolvedValue([lock]);

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);

      const button = await screen.findByTestId(`claim-button-${lock.id}`);
      expect(button).toBeEnabled();
      expect(screen.getByTestId(`lock-status-${lock.id}`)).toHaveTextContent("Ready to claim");
    });

    it("claims successfully and shows success feedback", async () => {
      const lock = makeLock({ unlockTime: Date.now() - 1_000 });
      listIncomingLocksMock.mockResolvedValue([lock]);
      const claimed: Lock = { ...lock, status: "claimed", claimTxHash: "abc123" };
      claimLockMock.mockResolvedValue(claimed);

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      const button = await screen.findByTestId(`claim-button-${lock.id}`);
      fireEvent.click(button);

      expect(await screen.findByTestId(`claim-feedback-${lock.id}`)).toHaveTextContent(/claimed/i);
      expect(claimLockMock).toHaveBeenCalledWith(lock.id, ADDRESS, "TESTNET");
      await waitFor(() => {
        expect(screen.getByTestId(`lock-status-${lock.id}`)).toHaveTextContent("Claimed");
      });
      expect(screen.queryByTestId(`claim-button-${lock.id}`)).not.toBeInTheDocument();
    });

    it("shows failure feedback and leaves the lock claimable when the claim fails for an unrelated reason", async () => {
      const lock = makeLock({ unlockTime: Date.now() - 1_000 });
      listIncomingLocksMock.mockResolvedValueOnce([lock]).mockResolvedValue([lock]);
      claimLockMock.mockRejectedValue(new Error("Network error"));

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      const button = await screen.findByTestId(`claim-button-${lock.id}`);
      fireEvent.click(button);

      expect(await screen.findByTestId(`claim-feedback-${lock.id}`)).toHaveTextContent("Network error");
      expect(screen.getByTestId(`claim-button-${lock.id}`)).toBeEnabled();
    });

    it("disables the button immediately to prevent a double-claim from a fast double-click", async () => {
      const lock = makeLock({ unlockTime: Date.now() - 1_000 });
      listIncomingLocksMock.mockResolvedValue([lock]);
      let resolveClaim!: (value: Lock) => void;
      claimLockMock.mockReturnValue(new Promise<Lock>((resolve) => (resolveClaim = resolve)));

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      const button = await screen.findByTestId(`claim-button-${lock.id}`);

      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      expect(claimLockMock).toHaveBeenCalledTimes(1);
      resolveClaim({ ...lock, status: "claimed" });
      await waitFor(() => expect(screen.getByTestId(`lock-status-${lock.id}`)).toHaveTextContent("Claimed"));
    });
  });

  describe("lock state: already claimed", () => {
    it("shows the claimed state with no claim action", async () => {
      const lock = makeLock({ status: "claimed", unlockTime: Date.now() - 60_000, claimTxHash: "abc123" });
      listIncomingLocksMock.mockResolvedValue([lock]);

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);

      await screen.findByTestId(`lock-row-${lock.id}`);
      expect(screen.getByTestId(`lock-status-${lock.id}`)).toHaveTextContent("Claimed");
      expect(screen.queryByTestId(`claim-button-${lock.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`lock-countdown-${lock.id}`)).not.toBeInTheDocument();
    });
  });

  describe("stale state: claimed from another session while this view is open", () => {
    it("reconciles the row to claimed instead of leaving it stuck retryable when the API reports a conflict", async () => {
      const lock = makeLock({ unlockTime: Date.now() - 1_000 });
      listIncomingLocksMock.mockResolvedValueOnce([lock]);
      claimLockMock.mockRejectedValue(new (await import("@/lib/api")).LockAlreadyClaimedError());
      const claimedElsewhere: Lock = { ...lock, status: "claimed", claimTxHash: "elsewhere-hash" };
      listIncomingLocksMock.mockResolvedValueOnce([claimedElsewhere]);

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      const button = await screen.findByTestId(`claim-button-${lock.id}`);
      fireEvent.click(button);

      // The re-check after the 409 must run and flip the row to claimed —
      // not leave a claimable button up for the user to retry against a lock
      // that is already gone.
      await waitFor(() => {
        expect(screen.getByTestId(`lock-status-${lock.id}`)).toHaveTextContent("Claimed");
      });
      expect(screen.queryByTestId(`claim-button-${lock.id}`)).not.toBeInTheDocument();
    });

    it("picks up an externally-claimed lock on the next background poll, without any local claim attempt", async () => {
      vi.useFakeTimers();
      const lock = makeLock({ unlockTime: Date.now() - 1_000 });
      listIncomingLocksMock.mockResolvedValueOnce([lock]);

      render(<ClaimsPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      await vi.waitFor(() => expect(screen.getByTestId(`claim-button-${lock.id}`)).toBeInTheDocument());

      const claimedElsewhere: Lock = { ...lock, status: "claimed", claimTxHash: "elsewhere-hash" };
      listIncomingLocksMock.mockResolvedValueOnce([claimedElsewhere]);

      await vi.advanceTimersByTimeAsync(15_000);

      await vi.waitFor(() => {
        expect(screen.getByTestId(`lock-status-${lock.id}`)).toHaveTextContent("Claimed");
      });
      expect(screen.queryByTestId(`claim-button-${lock.id}`)).not.toBeInTheDocument();
      expect(claimLockMock).not.toHaveBeenCalled();
    });
  });
});
