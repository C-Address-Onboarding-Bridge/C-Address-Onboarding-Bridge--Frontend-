"use client";

import { useState, useEffect, useMemo } from "react";
import { Wallet, ArrowLeftRight, CreditCard, Building2, Copy, Check, ExternalLink, Plus, Loader2, X, BarChart3 } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import AvatarUpload from "@/components/avatar-upload";
import TransactionHistory from "@/components/transaction-history";
import ClaimsPanel from "@/components/claims-panel";
import RecurringSchedulesPanel from "@/components/recurring-schedules-panel";
import LiveRegion from "@/components/live-region";
import Link from "next/link";
import { getAccountBalances, fetchRecentTransactions, getExplorerUrl, formatNetworkLabel, toSafeErrorMessage, requestTestXLM } from "@/lib/stellar";
import type { BridgeTransactionData } from "@/lib/stellar";
import { getFeeTierPreview } from "@/lib/api";
import type { FeeTierStatus } from "@/lib/feeTiers";
import FeeTierDisplay from "@/components/fee-tier-display";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

/**
 * Reserves the same two-line footprint as the loaded stat value (a bold
 * number plus a small label) so a card never resizes when data arrives.
 * `visible` gates only the pulse animation's visibility — the space is
 * claimed for the whole loading state so there is no shift either way.
 * (#485)
 */
function StatSkeleton({ visible, label }: { visible: boolean; label: string }) {
  return (
    <>
      <div role="status" className="sr-only">
        {label}
      </div>
      <div aria-hidden="true" className={`space-y-2 ${visible ? "" : "invisible"}`}>
        <div className="h-7 w-20 rounded bg-[var(--surface-2)] animate-pulse motion-reduce:animate-none" />
        <div className="h-3 w-10 rounded bg-[var(--surface-2)] animate-pulse motion-reduce:animate-none" />
      </div>
    </>
  );
}

/** How often the dashboard polls for updated balances and transactions. */
const DASHBOARD_POLL_INTERVAL_MS = 30_000;

// Content check for the 30s poll: transaction fields are derived from
// immutable Horizon records, so the only meaningful changes are which
// transactions exist (id) and their status. When nothing changed we keep the
// previous array reference so memoized <TransactionHistory> can skip its
// re-render entirely.
function areTransactionsEqual(a: BridgeTransactionData[], b: BridgeTransactionData[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].status !== b[i].status) return false;
  }
  return true;
}

// ─── Analytics (#479) ──────────────────────────────────────────────────────────
//
// Volume-over-time and transaction-count charts with a selectable range, an
// asset breakdown, and a data-table alternative for screen reader users. The
// aggregation is pure so it can be unit-tested without rendering; the chart
// component reads CSS variables so bars stay readable in light and dark themes.

export type AnalyticsRange = 7 | 30 | 90;

export interface AnalyticsBucket {
  /** ISO date key, e.g. "2026-08-01". */
  date: string;
  /** Short display label, e.g. "Aug 1". */
  label: string;
  /** Total volume (sum of amounts) on this day. */
  volume: number;
  /** Number of transactions on this day. */
  count: number;
  /** Volume per asset on this day. */
  byAsset: Record<string, number>;
}

function toDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function toLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Buckets transactions into the last `days` days (including today), zero-filled
 * so the charts always show a continuous range. Only transactions within the
 * range contribute; amounts that are not finite numbers are skipped.
 */
export function aggregateAnalytics(
  transactions: BridgeTransactionData[],
  days: AnalyticsRange
): AnalyticsBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = new Map<string, AnalyticsBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const dateKey = toDateKey(day.getTime());
    buckets.set(dateKey, {
      date: dateKey,
      label: toLabel(dateKey),
      volume: 0,
      count: 0,
      byAsset: {},
    });
  }

  for (const tx of transactions) {
    const bucket = buckets.get(toDateKey(tx.timestamp));
    if (!bucket) continue; // outside the selected range
    const volume = Number(tx.amount);
    if (!Number.isFinite(volume)) continue;
    bucket.volume += volume;
    bucket.count += 1;
    bucket.byAsset[tx.asset] = (bucket.byAsset[tx.asset] ?? 0) + volume;
  }

  return [...buckets.values()];
}

/** Compact volume display, e.g. "1,234.5". */
function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface BarChartProps {
  buckets: AnalyticsBucket[];
  valueOf: (bucket: AnalyticsBucket) => number;
  ariaLabel: string;
  color: string;
}

/** Minimal accessible bar chart. Each bar carries a <title> with its value. */
function BarChart({ buckets, valueOf, ariaLabel, color }: BarChartProps) {
  const max = Math.max(...buckets.map(valueOf), 1);
  const width = 600;
  const height = 140;
  const gap = 2;
  const slot = width / buckets.length;
  const barWidth = Math.max(2, slot - gap * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="w-full h-36"
      preserveAspectRatio="none"
    >
      {buckets.map((bucket, index) => {
        const value = valueOf(bucket);
        const barHeight = (value / max) * (height - 8);
        return (
          <rect
            key={bucket.date}
            x={index * slot + gap}
            y={height - barHeight - 4}
            width={barWidth}
            height={value > 0 ? Math.max(barHeight, 1) : 0}
            rx={1}
            fill={color}
          >
            <title>{`${bucket.label}: ${formatVolume(value)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * Analytics charts for the dashboard: volume and transaction count over a
 * selectable range, broken down by asset, with a data table as the accessible
 * alternative and an explicit empty state. Exported so tests can render it in
 * isolation without a wallet. (#479)
 */
export function AnalyticsSection({ transactions }: { transactions: BridgeTransactionData[] }) {
  const [range, setRange] = useState<AnalyticsRange>(30);
  const buckets = useMemo(() => aggregateAnalytics(transactions, range), [transactions, range]);

  const totals = useMemo(() => {
    let volume = 0;
    let count = 0;
    const byAsset: Record<string, number> = {};
    for (const bucket of buckets) {
      volume += bucket.volume;
      count += bucket.count;
      for (const [asset, value] of Object.entries(bucket.byAsset)) {
        byAsset[asset] = (byAsset[asset] ?? 0) + value;
      }
    }
    return { volume, count, byAsset };
  }, [buckets]);

  const hasActivity = buckets.some((bucket) => bucket.count > 0);

  return (
    <section aria-labelledby="analytics-heading" className="card p-5 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[var(--primary-light)]" />
          <h3 id="analytics-heading" className="font-semibold">
            Analytics
          </h3>
        </div>
        <div role="group" aria-label="Analytics range" className="flex items-center gap-1">
          {([7, 30, 90] as AnalyticsRange[]).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRange(days)}
              aria-pressed={range === days}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                range === days
                  ? "bg-[var(--primary)]/15 text-[var(--primary-light)]"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {days}D
            </button>
          ))}
        </div>
      </div>

      {!hasActivity ? (
        <div className="p-10 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No activity in the last {range} days yet. Complete a bridge transaction to
            see analytics here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-4 rounded-lg bg-[var(--surface-2)]">
              <p className="text-xs text-[var(--text-muted)] mb-1">Volume ({range}D)</p>
              <p className="text-xl font-bold">{formatVolume(totals.volume)}</p>
            </div>
            <div className="p-4 rounded-lg bg-[var(--surface-2)]">
              <p className="text-xs text-[var(--text-muted)] mb-1">Transactions ({range}D)</p>
              <p className="text-xl font-bold">{totals.count}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-2">Volume over time</p>
              <BarChart
                buckets={buckets}
                valueOf={(bucket) => bucket.volume}
                ariaLabel={`Volume over the last ${range} days`}
                color="var(--primary)"
              />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-2">Transactions over time</p>
              <BarChart
                buckets={buckets}
                valueOf={(bucket) => bucket.count}
                ariaLabel={`Transaction count over the last ${range} days`}
                color="var(--secondary)"
              />
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-[var(--text-muted)] mb-2">Volume by asset</p>
            {Object.keys(totals.byAsset).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No asset volume in this range.</p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {Object.entries(totals.byAsset).map(([asset, volume]) => (
                  <li key={asset} className="inline-flex items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-full bg-[var(--primary)]"
                    />
                    {asset}: {formatVolume(volume)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* The accessible alternative to the charts: a data table screen
              readers can navigate cell by cell. (#479) */}
          <table
            className="w-full text-xs"
            aria-label={`Analytics data for the last ${range} days`}
          >
            <caption className="sr-only">Daily volume and transaction count</caption>
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Date
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Volume
                </th>
                <th scope="col" className="py-2 font-medium">
                  Transactions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {buckets.map((bucket) => (
                <tr key={bucket.date}>
                  <td className="py-1.5 pr-3">{bucket.label}</td>
                  <td className="py-1.5 pr-3">{formatVolume(bucket.volume)}</td>
                  <td className="py-1.5">{bucket.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { isConnected, address, network, networkStatus, walletNetworkName, isNetworkSupported, connect } = useWallet();
  const { status: copyStatus, copy: copyToClipboard } = useCopyToClipboard();
  const [balance, setBalance] = useState<string | null>(null);
  const [feeTierStatus, setFeeTierStatus] = useState<FeeTierStatus | null>(null);
  const [transactions, setTransactions] = useState<BridgeTransactionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);
  const [faucetError, setFaucetError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    // Don't read balances off a guessed chain: on an unsupported/unreadable
    // network the app can't tell which Horizon is the right one, and the old
    // testnet fallback showed an unrelated (or empty) account state. The
    // fetched values are hidden from the UI below rather than cleared here, so
    // the previous network's data can't be mistaken for the current one. (#289)
    if (!isNetworkSupported) return;
    // Ignore results from any fetch that was in flight when this effect
    // re-ran (e.g. a rapid network switch). Without this, a slow response
    // for the previous network could overwrite fresh data for the current one.
    let cancelled = false;
    // isInitial distinguishes the first load from background poll ticks.
    // We only show the loading spinner on the initial fetch so that the UI
    // does not flash back to a skeleton state on every 30-second poll. (#292)
    const fetchData = async (isInitial: boolean) => {
      if (isInitial) setLoading(true);
      setError(null);
      try {
        // getFeeTierPreview never throws (resolves null on any failure), so it
        // can share this Promise.all without a failed tier fetch aborting the
        // balance/transaction load or being caught below as a page-level error.
        const [balResult, txResult, tierResult] = await Promise.all([
          getAccountBalances(address, network),
          fetchRecentTransactions(address, network, 10),
          getFeeTierPreview(address, network),
        ]);
        if (cancelled) return;
        setBalance(balResult.total);
        // Reuse the previous reference when nothing changed so React bails out
        // of re-rendering the memoized transaction list.
        setTransactions((prev) => (areTransactionsEqual(prev, txResult) ? prev : txResult));
        setFeeTierStatus(tierResult);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(toSafeErrorMessage(e, "Failed to fetch data. Please try again."));
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
    };
    fetchData(true);
    // Polling in a hidden/background tab burns network and battery for data
    // nobody is looking at. Skip the tick while hidden, and catch up
    // immediately the moment the tab becomes visible again instead of waiting
    // out the rest of the interval.
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchData(false);
    }, DASHBOARD_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchData(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isConnected, address, network, isNetworkSupported]);

  // Chain data is only shown for a network the app actually queried. (#289)
  const shownTransactions = isNetworkSupported ? transactions : [];
  const shownBalance = isNetworkSupported ? balance : null;
  const shownFeeTierStatus = isNetworkSupported ? feeTierStatus : null;
  const showLoading = loading && isNetworkSupported;
  // Waits ~200ms of continuous loading before the stat card skeletons become
  // visible, so a fast/cached fetch never flashes them. (#485)
  const showStatSkeleton = useDelayedLoading(showLoading, 200);

  const confirmedCount = shownTransactions.filter((t) => t.status === "confirmed").length;
  const pendingCount = shownTransactions.filter((t) => t.status === "pending").length;

  const handleCopy = () => {
    if (!address) return;
    copyToClipboard(address);
  };

  // The copy button reports its result by swapping icons (and, on failure, by
  // adding a "Copy failed" label) — both invisible to a screen reader, which is
  // still parked on the button and hears nothing. Announcing the outcome is the
  // only feedback AT users get that the address reached the clipboard.
  const copyAnnouncement =
    copyStatus === "copied"
      ? "Wallet address copied to clipboard."
      : copyStatus === "error"
        ? "Copy failed. Check clipboard permissions and try again."
        : "";

  const handleFaucet = async () => {
    if (!address) return;
    setFaucetLoading(true);
    setFaucetMessage(null);
    setFaucetError(null);
    const result = await requestTestXLM(address);
    if (result.success) {
      setFaucetMessage(result.message ?? "Test XLM requested.");
    } else {
      setFaucetError(result.message ?? "Faucet request failed.");
    }
    setFaucetLoading(false);
  };

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-[var(--primary-light)]" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
          <p className="text-[var(--text-muted)] mb-6">
            Connect your Freighter wallet to view your dashboard.
          </p>
          <button
            onClick={connect}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            <Wallet className="w-4 h-4" />
            Connect Freighter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-[var(--text-muted)]">Manage your C-address funding activity</p>
        </div>
        <Link
          href="/bridge"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Bridge
        </Link>
      </div>

      <div className="card p-5 mb-8">
        <AvatarUpload address={address ?? null} />
      </div>

      {isConnected && (
        <div className="card p-5 mb-8">
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3">Developer Checklist</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {isConnected ? <Check className="w-4 h-4 text-[var(--success)]" /> : <X className="w-4 h-4 text-[var(--text-muted)]" />}
              <span className={isConnected ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
                Connect wallet
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {shownBalance !== null && parseFloat(shownBalance) > 0 ? (
                <Check className="w-4 h-4 text-[var(--success)]" />
              ) : (
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <span className={shownBalance !== null && parseFloat(shownBalance) > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
                Fund account
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ArrowLeftRight className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-muted)]">Bridge assets</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-[var(--primary-light)]" />
            <span className="text-xs text-[var(--text-muted)]">Connected Address</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono">
              {address?.slice(0, 8)}...{address?.slice(-8)}
            </code>
            <button
              onClick={handleCopy}
              // title alone is an unreliable accessible name (it is skipped by
              // some AT and unavailable on touch), so name the button
              // explicitly and keep title for the sighted tooltip. The name
              // describes the action, not the result — the result is announced
              // through the live region below.
              aria-label="Copy wallet address"
              title={copyStatus === "error" ? "Copy failed — check clipboard permissions" : "Copy address"}
              className="p-1 rounded hover:bg-[var(--surface-2)] transition-colors"
            >
              {copyStatus === "copied" ? (
                <Check className="w-3 h-3 text-[var(--success)]" />
              ) : copyStatus === "error" ? (
                <X className="w-3 h-3 text-[var(--error,#ef4444)]" />
              ) : (
                <Copy className="w-3 h-3 text-[var(--text-muted)]" />
              )}
            </button>
            {copyStatus === "error" && (
              <span className="text-xs text-[var(--error,#ef4444)]">Copy failed</span>
            )}
            <LiveRegion message={copyAnnouncement} />
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            <span className={isNetworkSupported ? undefined : "text-[var(--error)] font-medium"}>
              {formatNetworkLabel(networkStatus, walletNetworkName)}
            </span>
            {address && isNetworkSupported && (
              <a
                href={getExplorerUrl(network, "account", address)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-[var(--primary-light)] hover:underline inline-flex items-center gap-0.5"
              >
                <ExternalLink className="w-3 h-3" />
                View
              </a>
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="text-xs text-[var(--text-muted)] mb-1">XLM Balance</div>
          {showLoading ? (
            <StatSkeleton visible={showStatSkeleton} label="Loading balance…" />
          ) : (
            <>
              <div className="text-2xl font-bold mb-1">
                {shownBalance !== null ? parseFloat(shownBalance).toFixed(2) : "—"}
              </div>
              <div className="text-xs text-[var(--text-muted)]">XLM</div>
              {network === "TESTNET" && !showLoading && (
                <div className="mt-3">
                  <button
                    onClick={handleFaucet}
                    disabled={faucetLoading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary-light)] text-xs font-medium hover:bg-[var(--primary)]/20 transition-colors disabled:opacity-50"
                  >
                    {faucetLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
                        Requesting...
                      </>
                    ) : (
                      "Request Test XLM"
                    )}
                  </button>
                  {faucetMessage && (
                    <p className="text-xs text-[var(--success)] mt-2">{faucetMessage}</p>
                  )}
                  {faucetError && (
                    <p className="text-xs text-[var(--error)] mt-2">{faucetError}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="card p-5">
          <div className="text-xs text-[var(--text-muted)] mb-1">Transactions</div>
          {showLoading ? (
            <StatSkeleton visible={showStatSkeleton} label="Loading transaction count…" />
          ) : (
            <>
              <div className="text-2xl font-bold mb-1">{shownTransactions.length}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {confirmedCount} confirmed{pendingCount > 0 ? `, ${pendingCount} pending` : ""}
              </div>
            </>
          )}
        </div>
      </div>

      {shownFeeTierStatus && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold mb-2 text-[var(--text-muted)]">Fee Tier</h3>
          <FeeTierDisplay status={shownFeeTierStatus} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Link
          href="/bridge"
          className="flex items-center gap-3 p-4 card card-hover"
        >
          <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-[var(--primary-light)]" />
          </div>
          <div>
            <p className="text-sm font-medium">G → C Bridge</p>
            <p className="text-xs text-[var(--text-muted)]">Fund from G-address</p>
          </div>
        </Link>

        <Link
          href="/onramp"
          className="flex items-center gap-3 p-4 card card-hover"
        >
          <div className="w-10 h-10 rounded-lg bg-[var(--secondary)]/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-[var(--secondary)]" />
          </div>
          <div>
            <p className="text-sm font-medium">Fiat Onramp</p>
            <p className="text-xs text-[var(--text-muted)]">Buy with card</p>
          </div>
        </Link>

        <Link
          href="/cex"
          className="flex items-center gap-3 p-4 card card-hover"
        >
          <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-sm font-medium">CEX Withdrawal</p>
            <p className="text-xs text-[var(--text-muted)]">Route exchange funds</p>
          </div>
        </Link>
      </div>

      {/* Activity-over-time charts with a selectable range and an accessible
          data table. Built from the same transaction list shown below. (#479) */}
      <AnalyticsSection transactions={shownTransactions} />

      {!isNetworkSupported && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-sm text-[var(--error)]"
        >
          {networkStatus === "UNSUPPORTED"
            ? `Freighter is on ${formatNetworkLabel(networkStatus, walletNetworkName)}, which this app doesn't support. Switch to Testnet or Mainnet to see balances and activity.`
            : "Freighter's network couldn't be read, so no chain data is shown. Unlock the extension and reload."}
        </div>
      )}

      {/* The fetch error appears asynchronously (initial load or a 30s poll
          tick), so without role="alert" it is never announced — a sighted user
          sees the balance/activity failure, an AT user sees nothing change. The
          unsupported-network banner above already carries the same role. */}
      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-sm text-[var(--error)]"
        >
          {error}
        </div>
      )}

      <TransactionHistory transactions={shownTransactions} loading={showLoading} network={network} address={address ?? undefined} />

      <div className="mt-8">
        <ClaimsPanel address={address ?? null} network={network} isNetworkSupported={isNetworkSupported} />
      </div>

      <div className="mt-8">
        <RecurringSchedulesPanel address={address ?? null} network={network} isNetworkSupported={isNetworkSupported} />
      </div>
    </div>
  );
}
