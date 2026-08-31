import React, { memo, useMemo, useState, useEffect } from "react";
import { ArrowLeftRight, CreditCard, Building2, ExternalLink, Loader2, Copy, Check, X, Search } from "lucide-react";
import type { BridgeTransactionData } from "@/lib/types";
import { getExplorerUrl } from "@/lib/stellar";
import type { StellarNetwork } from "@/lib/types";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import LiveRegion from "@/components/live-region";

const typeConfig: Record<string, { icon: typeof ArrowLeftRight; label: string; color: string }> = {
  "g-to-c": { icon: ArrowLeftRight, label: "G → C Bridge", color: "text-[var(--primary-light)]" },
  fiat: { icon: CreditCard, label: "Fiat Onramp", color: "text-[var(--secondary)]" },
  cex: { icon: Building2, label: "CEX Withdrawal", color: "text-[var(--accent)]" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-[var(--warning)]" },
  confirmed: { label: "Confirmed", color: "text-[var(--success)]" },
  failed: { label: "Failed", color: "text-[var(--error)]" },
};

const STATUS_FILTERS: Array<{ value: "all" | BridgeTransactionStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "failed", label: "Failed" },
];

/**
 * A transaction is claimable once its G → C bridge has settled — a pending
 * bridge has no funds on the C side yet, and fiat/CEX flows land directly in
 * the destination account rather than a claimable timelock. This is the only
 * eligibility signal `BridgeTransactionData` carries today; timelocked claims
 * arriving alongside batch funding will likely add an explicit flag, but this
 * keeps bulk claim meaningful (and its "not every row qualifies" case
 * testable) in the meantime. (#486)
 */
function isClaimEligible(tx: BridgeTransactionData): boolean {
  return tx.type === "g-to-c" && tx.status === "confirmed";
}

/** Minimal CSV escaping: quote any field containing a comma, quote or newline. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds CSV text for a bulk export. Exported for direct unit testing. */
export function buildTransactionsCsv(transactions: BridgeTransactionData[]): string {
  const header = ["id", "type", "status", "amount", "asset", "toAddress", "hash", "timestamp"];
  const rows = transactions.map((tx) =>
    [
      tx.id,
      tx.type,
      tx.status,
      tx.amount,
      tx.asset,
      tx.toAddress,
      tx.hash ?? "",
      new Date(tx.timestamp).toISOString(),
    ].map((v) => csvField(String(v)))
  );
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/** Triggers a browser download of the CSV. Swallows environments (older test
 *  runners, some SSR shells) that lack Blob/URL download support — the caller
 *  still confirms success via the on-screen status message either way. */
function downloadCsv(csv: string, filename: string): void {
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    // See doc comment above.
  }
}

interface Props {
  transactions: BridgeTransactionData[];
  loading: boolean;
  network: StellarNetwork;
  /** When provided, the "View all" link points to this account's history. (#294) */
  address?: string;
}

const TransactionItem = memo(function TransactionItem({
  tx,
  network,
  selected,
  onToggleSelected,
}: {
  tx: BridgeTransactionData;
  network: Props["network"];
  selected: boolean;
  onToggleSelected: (id: string) => void;
}) {
  const type = typeConfig[tx.type] || typeConfig["g-to-c"];
  const status = statusConfig[tx.status];
  const Icon = type.icon;

  // Each transaction item manages its own copy state so rows are independent —
  // copying one hash does not affect the feedback state of any other row.
  const { status: copyStatus, copy: copyHash } = useCopyToClipboard();

  const date = useMemo(() => new Date(tx.timestamp).toLocaleDateString(), [tx.timestamp]);
  const toShort = useMemo(() => {
    if (!tx.toAddress) return "";
    return tx.toAddress.length > 20 ? `${tx.toAddress.slice(0, 10)}...${tx.toAddress.slice(-6)}` : tx.toAddress;
  }, [tx.toAddress]);

  return (
    <div className="p-4 hover:bg-[var(--surface-2)] transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Bulk-selection checkbox. Selection is intentionally allowed on
              every row regardless of claim eligibility — mixed selections
              (some rows eligible, some not) are the normal case the bulk
              toolbar below has to explain, not something to prevent. (#486) */}
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(tx.id)}
            aria-label={`Select ${type.label} of ${tx.amount} ${tx.asset}`}
            className="w-4 h-4 flex-shrink-0 accent-[var(--primary)]"
          />
          <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0">
            <Icon className={`w-4 h-4 ${type.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{type.label}</p>
            <p className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">
              {tx.amount} {tx.asset} → {toShort}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xs font-medium ${status.color}`}>{status.label}</p>
          <p className="text-xs text-[var(--text-muted)]">{date}</p>
          {tx.hash && (
            <div className="flex items-center justify-end gap-1 mt-0.5">
              {/* Copy the raw transaction hash so users can reference it
                  without opening Stellar Expert — follows the same
                  copy/feedback pattern used on the Dashboard and CEX pages.
                  (#256) */}
              <button
                type="button"
                onClick={() => copyHash(tx.hash!)}
                title={
                  copyStatus === "error"
                    ? "Copy failed — check clipboard permissions"
                    : copyStatus === "copied"
                      ? "Copied!"
                      : "Copy transaction hash"
                }
                aria-label={
                  copyStatus === "copied"
                    ? "Transaction hash copied"
                    : copyStatus === "error"
                      ? "Failed to copy transaction hash"
                      : "Copy transaction hash"
                }
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
              <a
                href={getExplorerUrl(network, "tx", tx.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--primary-light)] hover:underline inline-flex items-center gap-0.5"
              >
                <ExternalLink className="w-3 h-3" />
                View
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function parseDateToTimestamp(dateStr: string, endOfDay = false): number {
  if (!dateStr) return 0;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (endOfDay) {
    return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function getInitialUrlState() {
  if (typeof window === "undefined") {
    return {
      q: "",
      status: "all",
      asset: "all",
      direction: "all",
      from: "",
      to: "",
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    status: params.get("status") || "all",
    asset: params.get("asset") || "all",
    direction: params.get("direction") || "all",
    from: params.get("from") || "",
    to: params.get("to") || "",
  };
}

function TransactionHistory({ transactions, loading, network, address }: Props) {
  const initial = getInitialUrlState();
  const [searchQuery, setSearchQuery] = useState(initial.q);
  const [statusFilter, setStatusFilter] = useState(initial.status);
  const [assetFilter, setAssetFilter] = useState(initial.asset);
  const [directionFilter, setDirectionFilter] = useState(initial.direction);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);

  const debouncedSearchQuery = useDebounceValue(searchQuery, 300);

  const uniqueAssets = useMemo(() => {
    const assets = new Set<string>();
    for (const tx of transactions) {
      assets.add(tx.asset);
    }
    return Array.from(assets).sort();
  }, [transactions]);

  const hasActiveFilters =
    debouncedSearchQuery ||
    statusFilter !== "all" ||
    assetFilter !== "all" ||
    directionFilter !== "all" ||
    dateFrom ||
    dateTo;

  const clearAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setAssetFilter("all");
    setDirectionFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearchQuery) params.set("q", debouncedSearchQuery);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (assetFilter !== "all") params.set("asset", assetFilter);
    if (directionFilter !== "all") params.set("direction", directionFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    const queryString = params.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [debouncedSearchQuery, statusFilter, assetFilter, directionFilter, dateFrom, dateTo]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase();
        const matchHash = tx.hash?.toLowerCase().includes(q);
        const matchFrom = tx.fromAddress.toLowerCase().includes(q);
        const matchTo = tx.toAddress.toLowerCase().includes(q);
        const matchMemo = tx.memo?.toLowerCase().includes(q);
        if (!matchHash && !matchFrom && !matchTo && !matchMemo) return false;
      }

      if (statusFilter !== "all" && tx.status !== statusFilter) return false;
      if (assetFilter !== "all" && tx.asset !== assetFilter) return false;

      if (directionFilter !== "all" && address) {
        if (directionFilter === "incoming" && tx.toAddress !== address) return false;
        if (directionFilter === "outgoing" && tx.fromAddress !== address) return false;
      }

      const fromTimestamp = parseDateToTimestamp(dateFrom, false);
      const toTimestamp = parseDateToTimestamp(dateTo, true);

      if (fromTimestamp && tx.timestamp < fromTimestamp) return false;
      if (toTimestamp && tx.timestamp > toTimestamp) return false;

      return true;
    });
  }, [transactions, debouncedSearchQuery, statusFilter, assetFilter, directionFilter, dateFrom, dateTo, address]);

  const items = useMemo(
    () => filteredTransactions.map((tx) => <TransactionItem key={tx.id} tx={tx} network={network} />),
    [filteredTransactions, network]
  );

  const showFilteredEmpty = !loading && hasActiveFilters && filteredTransactions.length === 0;
  const showEmpty = !loading && !hasActiveFilters && transactions.length === 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="p-5 border-b border-[var(--border)]">
        <h3 className="font-semibold">Recent Transactions</h3>
      </div>

      <div className="p-4 border-b border-[var(--border)] space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hash, address, memo..."
              aria-label="Search transactions"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            aria-label="Filter by asset"
            className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="all">All assets</option>
            {uniqueAssets.map((asset) => (
              <option key={asset} value={asset}>
                {asset}
              </option>
            ))}
          </select>
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            aria-label="Filter by direction"
            className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="all">All directions</option>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From date"
            className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To date"
            className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-[var(--error)] hover:bg-[var(--error)]/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div role="status" className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
          <span className="sr-only">Loading recent transactions…</span>
        </div>
      ) : showEmpty ? (
        <div className="p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">No transactions found</p>
        </div>
      ) : showFilteredEmpty ? (
        <div className="p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">No transactions match your filters.</p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Clear all filters
          </button>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">No transactions match the current filter.</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">{items}</div>
      )}

      <div className="p-4 border-t border-[var(--border)]">
        {/* Link to the account's specific transaction history when an address
            is available, otherwise fall back to the explorer home. (#294) */}
        <a
          href={
            address
              ? getExplorerUrl(network, "account", address)
              : `https://stellar.expert/explorer/${network === "PUBLIC" ? "public" : "testnet"}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          View all on Stellar Expert
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <LiveRegion message={statusMessage} />

      {confirmingClaim && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-claim-title"
          aria-describedby="bulk-claim-description"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onKeyDown={handleDialogKeyDown}
          data-testid="bulk-claim-dialog"
        >
          <div className="card w-full max-w-sm p-6" style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <h2 id="bulk-claim-title" className="text-lg font-semibold mb-2">
              Confirm claim
            </h2>
            <p id="bulk-claim-description" className="text-sm text-[var(--text-muted)] mb-6">
              This claims {selectedCount} transaction{selectedCount === 1 ? "" : "s"} and moves funds on-chain.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelClaim}
                autoFocus
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--surface-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClaim}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
              >
                Confirm claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TransactionHistory);
