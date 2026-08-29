"use client";

import { useState, useEffect } from "react";
import { Wallet, ArrowLeftRight, CreditCard, Building2, Copy, Check, ExternalLink, Plus, Loader2, X } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import AvatarUpload from "@/components/avatar-upload";
import TransactionHistory from "@/components/transaction-history";
import ClaimsPanel from "@/components/claims-panel";
import LiveRegion from "@/components/live-region";
import Link from "next/link";
import { getAccountBalances, fetchRecentTransactions, getExplorerUrl, formatNetworkLabel, toSafeErrorMessage, requestTestXLM } from "@/lib/stellar";
import type { BridgeTransactionData } from "@/lib/stellar";
import { getFeeTierPreview } from "@/lib/api";
import type { FeeTierStatus } from "@/lib/feeTiers";
import FeeTierDisplay from "@/components/fee-tier-display";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

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

export default function DashboardPage() {
  const { isConnected, address, network, networkStatus, walletNetworkName, isNetworkSupported, connect } = useWallet();
  const { status: copyStatus, copy: copyToClipboard } = useCopyToClipboard();
  const [balance, setBalance] = useState<string | null>(null);
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
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Loading...</span>
            </div>
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
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Loading...</span>
            </div>
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
    </div>
  );
}
