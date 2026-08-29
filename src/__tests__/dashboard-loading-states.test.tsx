// @vitest-environment jsdom
//
// Coverage for the dashboard's balance/transaction-count stat cards: loading
// (with and without the skeleton's visibility delay), empty, and populated.
// (#485)
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DashboardPage from "@/components/routes/dashboard-page";

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";

const getAccountBalances = vi.fn();
const fetchRecentTransactions = vi.fn();

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    getAccountBalances: (...args: unknown[]) => getAccountBalances(...args),
    fetchRecentTransactions: (...args: unknown[]) => fetchRecentTransactions(...args),
  };
});

const wallet = {
  isConnected: true,
  address: ADDRESS,
  network: "TESTNET" as const,
  networkStatus: "TESTNET" as const,
  walletNetworkName: "TESTNET",
  isNetworkSupported: true,
  connect: vi.fn(),
};

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => wallet,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

/** A promise plus its resolver, for controlling exactly when a fetch "completes". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("Dashboard stat cards — loading, empty, populated (#485)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("announces loading immediately but keeps the skeleton invisible before the delay elapses", async () => {
    const balances = deferred<{ total: string }>();
    const transactions = deferred<unknown[]>();
    getAccountBalances.mockReturnValue(balances.promise);
    fetchRecentTransactions.mockReturnValue(transactions.promise);

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<DashboardPage />));
    });

    const statuses = screen.getAllByRole("status").map((el) => el.textContent);
    expect(statuses).toContain("Loading balance…");
    expect(statuses).toContain("Loading transaction count…");

    // Reserved-space skeleton blocks exist but are not yet visible.
    const skeletons = container.querySelectorAll('[aria-hidden="true"].invisible');
    expect(skeletons.length).toBeGreaterThan(0);

    // Resolve so the effect's pending fetch doesn't leak into the next test.
    await act(async () => {
      balances.resolve({ total: "0.0000000" });
      transactions.resolve([]);
    });
  });

  it("reveals the stat skeletons once the delay elapses while still loading", async () => {
    const balances = deferred<{ total: string }>();
    const transactions = deferred<unknown[]>();
    getAccountBalances.mockReturnValue(balances.promise);
    fetchRecentTransactions.mockReturnValue(transactions.promise);

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<DashboardPage />));
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const stillHiddenSkeletons = container.querySelectorAll('[aria-hidden="true"].invisible');
    expect(stillHiddenSkeletons.length).toBe(0);
    expect(container.innerHTML).toContain("animate-pulse");

    await act(async () => {
      balances.resolve({ total: "0.0000000" });
      transactions.resolve([]);
    });
  });

  it("shows an explicit empty state (0 XLM, 0 transactions) instead of looking stuck", async () => {
    getAccountBalances.mockResolvedValue({ total: "0.0000000" });
    fetchRecentTransactions.mockResolvedValue([]);

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.queryByRole("status", { name: /loading/i })).toBeNull();
    expect(screen.getByText("0.00")).not.toBeNull();
    expect(screen.getByText("XLM")).not.toBeNull();
    expect(screen.getByText("0")).not.toBeNull();
    expect(screen.getByText("No transactions found for this account.")).not.toBeNull();
  });

  it("shows populated balance and transaction counts once data arrives", async () => {
    getAccountBalances.mockResolvedValue({ total: "123.4500000" });
    fetchRecentTransactions.mockResolvedValue([
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
    ]);

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByText("123.45")).not.toBeNull();
    expect(screen.getByText("1")).not.toBeNull();
    expect(screen.getByText("1 confirmed")).not.toBeNull();
  });
});
