import React, { memo, useMemo } from "react";
import { ArrowLeftRight, CreditCard, Building2, ExternalLink, Copy, Check, X, Inbox } from "lucide-react";
import type { BridgeTransactionData } from "@/lib/types";
import { getExplorerUrl } from "@/lib/stellar";
import type { StellarNetwork } from "@/lib/types";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

/** How many skeleton rows to reserve space for while the real count is unknown. */
const SKELETON_ROW_COUNT = 3;
const SKELETON_ROW_KEYS = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => i);

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

interface Props {
  transactions: BridgeTransactionData[];
  loading: boolean;
  network: StellarNetwork;
  /** When provided, the "View all" link points to this account's history. (#294) */
  address?: string;
}

const TransactionItem = memo(function TransactionItem({ tx, network }: { tx: BridgeTransactionData; network: Props["network"] }) {
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

// Mirrors the shape of a real TransactionItem row (icon + two lines on the
// left, two right-aligned lines) so the panel is already the right height
// before any transaction data exists — swapping this out for real rows never
// shifts the surrounding page. (#485)
function TransactionSkeletonRow() {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between animate-pulse motion-reduce:animate-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] flex-shrink-0" />
          <div className="min-w-0 space-y-2">
            <div className="h-3.5 w-28 rounded bg-[var(--surface-2)]" />
            <div className="h-3 w-20 rounded bg-[var(--surface-2)]" />
          </div>
        </div>
        <div className="text-right flex-shrink-0 space-y-2">
          <div className="h-3 w-14 rounded bg-[var(--surface-2)] ml-auto" />
          <div className="h-3 w-10 rounded bg-[var(--surface-2)] ml-auto" />
        </div>
      </div>
    </div>
  );
}

function TransactionHistory({ transactions, loading, network, address }: Props) {
  // Waits ~200ms of continuous loading before showing the skeleton so a fast
  // response (cache hit, quick RPC) never flashes it. The skeleton rows below
  // are always mounted while loading (reserving their height immediately) and
  // are only made visible once this flips true, so there is no layout shift
  // either way. (#485)
  const showSkeleton = useDelayedLoading(loading, 200);
  const items = useMemo(
    () => transactions.map((tx) => <TransactionItem key={tx.id} tx={tx} network={network} />),
    [transactions, network]
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="p-5 border-b border-[var(--border)]">
        <h3 className="font-semibold">Recent Transactions</h3>
      </div>
      {loading ? (
        <>
          {/* The visible skeleton below is aria-hidden (it's decorative and
              its row count is arbitrary), so this is the only thing a screen
              reader hears — announced immediately, independent of the visual
              delay, since there is no "flash" concern for an announcement. */}
          <div role="status" className="sr-only">
            Loading recent transactions…
          </div>
          {/* Rendered for the entire loading state so the panel reserves its
              final height right away; only visibility (not layout) waits on
              the delay, so fast loads never flash the skeleton. (#485) */}
          <div
            aria-hidden="true"
            className={`divide-y divide-[var(--border)] ${showSkeleton ? "" : "invisible"}`}
          >
            {SKELETON_ROW_KEYS.map((key) => (
              <TransactionSkeletonRow key={key} />
            ))}
          </div>
        </>
      ) : transactions.length === 0 ? (
        // Distinct from the loading state above: an empty account gets a
        // plain-language explanation instead of a spinner or bare skeleton,
        // so it reads as "confirmed empty" rather than "stuck loading". (#485)
        <div className="p-12 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--text-muted)]">No transactions found for this account.</p>
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
    </div>
  );
}

export default memo(TransactionHistory);
