import React, { memo, useMemo } from "react";
import { ArrowLeftRight, CreditCard, Building2, ExternalLink, Loader2 } from "lucide-react";
import type { BridgeTransactionData } from "@/lib/types";
import { getExplorerUrl } from "@/lib/stellar";
import { formatTransactionDate } from "@/lib/format";
import type { StellarNetwork } from "@/lib/types";

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

  // Formatted against the app's declared locale rather than the host's, so the
  // date matches the surrounding English text on every machine and renders the
  // same on the server as it does after hydration.
  const date = useMemo(() => formatTransactionDate(tx.timestamp), [tx.timestamp]);
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
            <a
              href={getExplorerUrl(network, "tx", tx.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--primary-light)] hover:underline inline-flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" />
              View
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

function TransactionHistory({ transactions, loading, network, address }: Props) {
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
        <div className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-12 text-center">
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
