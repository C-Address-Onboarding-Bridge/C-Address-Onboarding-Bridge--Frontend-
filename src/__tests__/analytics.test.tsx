// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AnalyticsSection, aggregateAnalytics } from "@/components/routes/dashboard-page";
import type { BridgeTransactionData } from "@/lib/stellar";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const DAY_MS = 86_400_000;
const NOW = Date.now();

/** Local-date key matching aggregateAnalytics's bucketing. */
function localDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function tx(overrides: Partial<BridgeTransactionData>): BridgeTransactionData {
  return {
    id: Math.random().toString(36).slice(2),
    fromAddress: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
    toAddress: "CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
    amount: "10",
    asset: "XLM",
    status: "confirmed",
    timestamp: NOW,
    type: "g-to-c",
    ...overrides,
  };
}

describe("aggregateAnalytics", () => {
  it("zero-fills every day in the range so charts are continuous", () => {
    const buckets = aggregateAnalytics([], 7);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
    // Ascending chronological order.
    expect(buckets[0].date < buckets[1].date).toBe(true);
  });

  it("counts transactions per day and tracks volume by asset", () => {
    const twoDaysAgoKey = localDateKey(NOW - 2 * DAY_MS);
    const buckets = aggregateAnalytics(
      [
        tx({ amount: "10", asset: "XLM", timestamp: NOW - 2 * DAY_MS }),
        tx({ amount: "5", asset: "XLM", timestamp: NOW - 2 * DAY_MS }),
        tx({ amount: "20", asset: "USDC", timestamp: NOW }),
      ],
      7
    );
    const twoDaysAgo = buckets.find((b) => b.date === twoDaysAgoKey);
    expect(twoDaysAgo).toBeDefined();
    expect(twoDaysAgo?.count).toBe(2);
    expect(twoDaysAgo?.byAsset).toEqual({ XLM: 15 });
    expect(buckets[buckets.length - 1]?.count).toBe(1);
    expect(buckets[buckets.length - 1]?.byAsset).toEqual({ USDC: 20 });
  });

  it("ignores transactions outside the selected range", () => {
    const buckets = aggregateAnalytics([tx({ timestamp: NOW - 40 * DAY_MS })], 7);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("skips non-finite amounts", () => {
    const buckets = aggregateAnalytics([tx({ amount: "not-a-number", timestamp: NOW })], 7);
    const today = buckets[buckets.length - 1];
    expect(today?.count).toBe(0);
  });

  it("gives correct 30D and 90D totals for 25 payments spread over 60 days (#938)", () => {
    // One payment every ~2.4 days for 60 days: 25 payments total, all
    // within 90D, but only the more recent ones fall within 30D. This is
    // exactly the shape the dashboard's "fetch only 10 records" bug got
    // wrong — switching range used to change nothing once there were
    // more than 10 payments in history.
    const payments: BridgeTransactionData[] = Array.from({ length: 25 }, (_, i) =>
      tx({ amount: "1", asset: "XLM", timestamp: NOW - i * 2.4 * DAY_MS })
    );

    const totalCount = (range: 7 | 30 | 90) =>
      aggregateAnalytics(payments, range).reduce((sum, b) => sum + b.count, 0);

    const within30 = payments.filter((p) => NOW - p.timestamp <= 30 * DAY_MS).length;
    const within90 = payments.filter((p) => NOW - p.timestamp <= 90 * DAY_MS).length;

    expect(within30).toBeGreaterThan(10); // the old hard cap this bug is about
    expect(within30).toBeLessThan(within90);
    expect(within90).toBe(25); // all 25 fit inside 90 days

    expect(totalCount(30)).toBe(within30);
    expect(totalCount(90)).toBe(within90);
    // Switching the range must actually change the total — the bug report's
    // core symptom was that it didn't.
    expect(totalCount(30)).not.toBe(totalCount(90));
  });
});

describe("AnalyticsSection", () => {
  afterEach(cleanup);

  it("shows the empty state for an account with no history", () => {
    render(<AnalyticsSection transactions={[]} />);
    expect(screen.getByText(/No activity in the last 30 days yet/i)).not.toBeNull();
  });

  it("defaults to the 30-day range with 30D selected", () => {
    render(<AnalyticsSection transactions={[tx({ timestamp: NOW })]} />);
    const thirty = screen.getByRole("button", { name: "30D" });
    expect(thirty.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Transactions \(30D\)/i)).not.toBeNull();
  });

  it("switches the range to 7D and 90D", () => {
    render(<AnalyticsSection transactions={[tx({ timestamp: NOW })]} />);

    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    expect(screen.getByRole("button", { name: "7D" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Transactions \(7D\)/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "90D" }));
    expect(screen.getByRole("button", { name: "90D" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Transactions \(90D\)/i)).not.toBeNull();
  });

  it("breaks volume down by asset", () => {
    render(
      <AnalyticsSection
        transactions={[
          tx({ amount: "10", asset: "XLM", timestamp: NOW }),
          tx({ amount: "20", asset: "USDC", timestamp: NOW }),
        ]}
      />
    );
    expect(screen.getAllByText(/XLM: 10/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/USDC: 20/i).length).toBeGreaterThan(0);
  });

  it("renders the accessible data table with daily rows", () => {
    render(<AnalyticsSection transactions={[tx({ amount: "10", timestamp: NOW })]} />);
    const table = screen.getByRole("table", { name: /Analytics data for the last 30 days/i });
    expect(table).not.toBeNull();
    // Header row plus 30 zero-filled day rows.
    expect(table.querySelectorAll("tbody tr")).toHaveLength(30);
    // Check that table has the new "Volume (by asset)" header
    expect(screen.getByText(/Volume \(by asset\)/i)).not.toBeNull();
  });

  it("labels the chart accessibly", () => {
    render(<AnalyticsSection transactions={[tx({ timestamp: NOW })]} />);
    expect(screen.getByRole("img", { name: /Transaction count over the last 30 days/i })).not.toBeNull();
  });

  it("range switching recomputes the table row count", () => {
    render(<AnalyticsSection transactions={[tx({ timestamp: NOW })]} />);
    const table = screen.getByRole("table", { name: /Analytics data for the last 30 days/i });

    fireEvent.click(screen.getByRole("button", { name: "7D" }));

    expect(table.querySelectorAll("tbody tr")).toHaveLength(7);
  });
});
