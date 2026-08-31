// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { screen, fireEvent } from "@testing-library/react";
import TransactionHistory from "@/components/transaction-history";
import type { BridgeTransactionData } from "@/lib/types";

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    getExplorerUrl: (_network: unknown, _type: unknown, id: string) => `https://stellar.expert/explorer/testnet/tx/${id}`,
  };
});

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ status: "idle", copy: vi.fn(), reset: vi.fn() }),
}));

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";

const baseTransactions: BridgeTransactionData[] = [
  {
    id: "1",
    fromAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ",
    toAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    amount: "10",
    asset: "XLM",
    status: "confirmed",
    timestamp: 1_700_000_000_000,
    type: "g-to-c",
    hash: "abc123hash",
    memo: "first",
  },
  {
    id: "2",
    fromAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ",
    toAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    amount: "5",
    asset: "USDC",
    status: "pending",
    timestamp: 1_700_000_100_000,
    type: "cex",
    hash: "def456hash",
    memo: "second",
  },
  {
    id: "3",
    fromAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    toAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ",
    amount: "20",
    asset: "XLM",
    status: "failed",
    timestamp: 1_700_000_200_000,
    type: "fiat",
    hash: "ghi789hash",
    memo: "third",
  },
];

describe("TransactionHistory filters", () => {
  let container: HTMLDivElement;
  let root: Root;
  let replaceStateMock: vi.MockedFunction<typeof window.history.replaceState>;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    replaceStateMock = vi.fn();
    window.history.replaceState = replaceStateMock;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const renderHistory = async (props: Partial<React.ComponentProps<typeof TransactionHistory>> = {}) => {
    await act(async () => {
      root.render(
        <TransactionHistory
          transactions={baseTransactions}
          loading={false}
          network="TESTNET"
          address={ADDRESS}
          {...props}
        />
      );
    });
  };

  const searchInput = () => screen.getByPlaceholderText(/search/i);
  const statusSelect = () => screen.getAllByRole("combobox")[0];
  const assetSelect = () => screen.getAllByRole("combobox")[1];
  const directionSelect = () => screen.getAllByRole("combobox")[2];
  const dateInputs = () => container.querySelectorAll('input[type="date"]');

  it("renders all filter controls", async () => {
    await renderHistory();
    expect(searchInput()).toBeDefined();
    expect(statusSelect()).toBeDefined();
    expect(assetSelect()).toBeDefined();
    expect(directionSelect()).toBeDefined();
    expect(dateInputs()).toHaveLength(2);
  });

  it("filters by status", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(statusSelect(), { target: { value: "pending" } });
    });

    expect(screen.getByText((content) => content.includes("5") && content.includes("USDC"))).toBeDefined();
    expect(screen.queryByText((content) => content.includes("10") && content.includes("XLM"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("20") && content.includes("XLM"))).toBeNull();
  });

  it("filters by asset", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(assetSelect(), { target: { value: "USDC" } });
    });

    expect(screen.getByText((content) => content.includes("5") && content.includes("USDC"))).toBeDefined();
    expect(screen.queryByText((content) => content.includes("10") && content.includes("XLM"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("20") && content.includes("XLM"))).toBeNull();
  });

  it("filters by direction incoming", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(directionSelect(), { target: { value: "incoming" } });
    });

    expect(screen.getByText((content) => content.includes("20") && content.includes("XLM"))).toBeDefined();
    expect(screen.queryByText((content) => content.includes("10") && content.includes("XLM"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("5") && content.includes("USDC"))).toBeNull();
  });

  it("filters by direction outgoing", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(directionSelect(), { target: { value: "outgoing" } });
    });

    expect(screen.getByText((content) => content.includes("10") && content.includes("XLM"))).toBeDefined();
    expect(screen.getByText((content) => content.includes("5") && content.includes("USDC"))).toBeDefined();
    expect(screen.queryByText((content) => content.includes("20") && content.includes("XLM"))).toBeNull();
  });

  it("searches by hash", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(searchInput(), { target: { value: "def456" } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByText((content) => content.includes("5") && content.includes("USDC"))).toBeDefined();
    expect(screen.queryByText((content) => content.includes("10") && content.includes("XLM"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("20") && content.includes("XLM"))).toBeNull();
  });

  it("searches by memo", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(searchInput(), { target: { value: "third" } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByText((content) => content.includes("20") && content.includes("XLM"))).toBeDefined();
    expect(screen.queryByText((content) => content.includes("10") && content.includes("XLM"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("5") && content.includes("USDC"))).toBeNull();
  });

  it("filters by date range", async () => {
    await renderHistory();
    const [fromInput, toInput] = Array.from(dateInputs()) as HTMLInputElement[];
    await act(async () => {
      fireEvent.change(fromInput, { target: { value: "2023-11-01" } });
      fireEvent.change(toInput, { target: { value: "2023-11-13" } });
    });

    expect(screen.queryByText((content) => content.includes("10") && content.includes("XLM"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("5") && content.includes("USDC"))).toBeNull();
    expect(screen.queryByText((content) => content.includes("20") && content.includes("XLM"))).toBeNull();
    expect(screen.getByText(/no transactions match/i)).toBeDefined();
  });

  it("shows empty state with clear button when filters yield no results", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(searchInput(), { target: { value: "zzzz-no-match" } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByText(/no transactions match/i)).toBeDefined();
    expect(screen.getByText(/clear all filters/i)).toBeDefined();
  });

  it("clears all filters", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(searchInput(), { target: { value: "zzzz" } });
      fireEvent.change(statusSelect(), { target: { value: "pending" } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByText(/no transactions match/i)).toBeDefined();

    await act(async () => {
      (screen.getByText(/clear all filters/i) as HTMLButtonElement).click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByText((content) => content.includes("10") && content.includes("XLM"))).toBeDefined();
    expect(screen.getByText((content) => content.includes("5") && content.includes("USDC"))).toBeDefined();
    expect(screen.getByText((content) => content.includes("20") && content.includes("XLM"))).toBeDefined();
  });

  it("syncs filter state to the URL", async () => {
    await renderHistory();
    await act(async () => {
      fireEvent.change(searchInput(), { target: { value: "abc123" } });
      fireEvent.change(statusSelect(), { target: { value: "confirmed" } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(replaceStateMock).toHaveBeenCalled();
    const lastCall = replaceStateMock.mock.calls[replaceStateMock.mock.calls.length - 1][2] as string;
    expect(lastCall).toContain("q=abc123");
    expect(lastCall).toContain("status=confirmed");
  });
});
