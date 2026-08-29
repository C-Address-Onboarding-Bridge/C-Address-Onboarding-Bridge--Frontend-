import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, CreditCard, Building2, ExternalLink, Loader2, Copy, Check, X, Download, Wallet } from "lucide-react";
import type { BridgeTransactionData, BridgeTransactionStatus } from "@/lib/types";
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

function TransactionHistory({ transactions, loading, network, address }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BridgeTransactionStatus>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmingClaim, setConfirmingClaim] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const isFiltered = searchQuery.trim() !== "" || statusFilter !== "all";

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (statusFilter !== "all" && tx.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [tx.asset, tx.type, typeConfig[tx.type]?.label ?? "", tx.toAddress, tx.hash ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [transactions, searchQuery, statusFilter]);

  const filteredIds = useMemo(() => filteredTransactions.map((t) => t.id), [filteredTransactions]);

  const selectedFilteredCount = useMemo(
    () => filteredIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0),
    [filteredIds, selectedIds]
  );

  const allFilteredSelected = filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someFilteredSelected;
  }, [someFilteredSelected]);

  // Selection persists across filter/search changes (like an inbox), so
  // narrowing then widening the filter doesn't silently drop a choice made
  // earlier. The header checkbox only ever acts on the *currently filtered*
  // set — selecting "all" while a filter is active never touches hidden rows.
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allFilteredSelected, filteredIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedTransactions = useMemo(
    () => transactions.filter((t) => selectedIds.has(t.id)),
    [transactions, selectedIds]
  );
  const selectedCount = selectedTransactions.length;

  const claimIneligibleCount = useMemo(
    () => selectedTransactions.filter((t) => !isClaimEligible(t)).length,
    [selectedTransactions]
  );
  const canExport = selectedCount > 0;
  const canClaim = selectedCount > 0 && claimIneligibleCount === 0;
  const claimDisabledReason =
    selectedCount > 0 && claimIneligibleCount > 0
      ? `${claimIneligibleCount} of ${selectedCount} selected transaction${selectedCount === 1 ? "" : "s"} can't be claimed — only confirmed G → C bridge transactions are eligible. Adjust your selection to claim the rest.`
      : "";

  const handleExport = useCallback(() => {
    if (!canExport) return;
    const csv = buildTransactionsCsv(selectedTransactions);
    downloadCsv(csv, `transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    setStatusMessage(`Exported ${selectedCount} transaction${selectedCount === 1 ? "" : "s"}.`);
  }, [canExport, selectedTransactions, selectedCount]);

  const handleClaimClick = useCallback(() => {
    if (!canClaim) return;
    setConfirmingClaim(true);
  }, [canClaim]);

  const handleCancelClaim = useCallback(() => setConfirmingClaim(false), []);

  const handleConfirmClaim = useCallback(() => {
    setStatusMessage(`Claimed ${selectedCount} transaction${selectedCount === 1 ? "" : "s"}.`);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      selectedTransactions.forEach((t) => next.delete(t.id));
      return next;
    });
    setConfirmingClaim(false);
  }, [selectedCount, selectedTransactions]);

  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") handleCancelClaim();
    },
    [handleCancelClaim]
  );

  const items = useMemo(
    () =>
      filteredTransactions.map((tx) => (
        <TransactionItem
          key={tx.id}
          tx={tx}
          network={network}
          selected={selectedIds.has(tx.id)}
          onToggleSelected={toggleRow}
        />
      )),
    [filteredTransactions, network, selectedIds, toggleRow]
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="p-5 border-b border-[var(--border)]">
        <h3 className="font-semibold">Recent Transactions</h3>
      </div>

      {!loading && transactions.length > 0 && (
        <div className="p-4 border-b border-[var(--border)] flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by asset, address or hash"
              aria-label="Search transactions"
              className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | BridgeTransactionStatus)}
              aria-label="Filter by status"
              className="px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllFiltered}
                disabled={filteredIds.length === 0}
                aria-label={
                  isFiltered
                    ? `Select all ${filteredIds.length} filtered transactions`
                    : `Select all ${filteredIds.length} transactions`
                }
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <span className="text-[var(--text-muted)]">
                {isFiltered ? `Select all ${filteredIds.length} filtered` : `Select all ${filteredIds.length}`}
              </span>
            </label>

            {selectedCount > 0 && (
              <>
                <span className="text-sm font-medium" data-testid="selection-count">
                  {selectedCount} selected
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Clear selection
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={!canExport}
                    title={`Export ${selectedCount} selected transaction${selectedCount === 1 ? "" : "s"} as CSV`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={handleClaimClick}
                    disabled={!canClaim}
                    title={
                      canClaim
                        ? `Claim ${selectedCount} selected transaction${selectedCount === 1 ? "" : "s"}`
                        : claimDisabledReason
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-sm hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Claim
                  </button>
                </div>
              </>
            )}
          </div>

          {claimDisabledReason && (
            <p className="text-xs text-[var(--text-muted)]" role="note">
              {claimDisabledReason}
            </p>
          )}
        </div>
      )}

      {loading ? (
        // The spinner is the only loading indicator, and lucide marks its svg
        // aria-hidden, so this panel was an empty box to a screen reader: no
        // announcement on entering the loading state and no text to find when
        // navigating into it. role="status" plus a hidden label fixes both.
        <div role="status" className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
          <span className="sr-only">Loading recent transactions…</span>
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">No transactions found for this account.</p>
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
