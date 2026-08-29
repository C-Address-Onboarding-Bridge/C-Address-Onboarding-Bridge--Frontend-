"use client";

import { use, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Radio,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import { IN_FLIGHT_TRANSACTION_KEY } from "@/components/error-boundary";
import {
  getTransactionByHash,
  subscribeToTransactionStatus,
  type TransactionDetails,
} from "@/lib/stellar";

/** Poll interval while the transaction is still in flight. (#474) */
const IN_FLIGHT_POLL_MS = 5_000;

/** Explorer URL built inline (the app's getExplorerUrl helper is stubbed for
 * another issue; this page must not crash on the detail route). */
function explorerTxUrl(network: string, hash: string): string {
  const base = network === "PUBLIC" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${base}/tx/${encodeURIComponent(hash)}`;
}

function stroopsToXlm(stroops: number): string {
  if (!Number.isFinite(stroops) || stroops <= 0) return "—";
  return `${(stroops / 10_000_000).toFixed(7)} XLM`;
}

type LoadState = "loading" | "found" | "not-found" | "error";

/**
 * Transaction detail page (#474).
 *
 * Resolves a transaction hash against Horizon and renders a full record:
 * status banner, transfer details, fee, ledger, memo and explorer/copy/share
 * links. A well-formed hash that Horizon hasn't ingested yet is treated as
 * "in flight" and re-polled instead of shown as a dead-end "not found".
 */
export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = params instanceof Promise ? use(params) : params;
  const { network } = useWallet();

  const [details, setDetails] = useState<TransactionDetails | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const [liveTransport, setLiveTransport] = useState<"sse" | "polling">("sse");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    getTransactionByHash(hash, network)
      .then((result) => {
        if (cancelled) return;
        setDetails(result);
        setLoadState(result ? "found" : "not-found");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [hash, network, tick]);

  // A well-formed hash that Horizon hasn't ingested yet is still in flight —
  // keep polling until it lands or the user leaves. (#474)
  useEffect(() => {
    if (loadState !== "found" || details?.status !== "pending") return;
    const timer = setTimeout(() => setTick((t) => t + 1), IN_FLIGHT_POLL_MS);
    return () => clearTimeout(timer);
  }, [loadState, details?.status, tick]);

  // Live status via the SSE stream (#471). The subscription closes itself on a
  // terminal state, falls back to polling when SSE is unavailable/failing, and
  // pauses while the tab is hidden. The tick poll above stays as a safety net
  // that also refreshes the full record while the tx is in flight.
  useEffect(() => {
    if (details?.status !== "pending") return;
    const subscription = subscribeToTransactionStatus({
      hash,
      network,
      onStatus: (status) => {
        if (status === "pending") return;
        setDetails((prev) => (prev ? { ...prev, status } : prev));
        // Terminal state: the bridge page's in-flight marker is stale now. (#473)
        try {
          sessionStorage.removeItem(IN_FLIGHT_TRANSACTION_KEY);
        } catch {
          // Storage unavailable — nothing to clean up.
        }
        // Horizon has the record now; re-fetch so the page shows the full
        // record (fees, ledger, timeline) instead of the pending skeleton.
        setTick((t) => t + 1);
      },
      onError: () => setLiveTransport("polling"),
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveTransport(subscription.transport);
    return () => subscription.unsubscribe();
  }, [hash, network, details?.status]);

  // Terminal state: the in-flight marker set by the bridge page is no longer
  // needed, so a later crash won't keep showing the recovery link. (#473)
  useEffect(() => {
    if (details?.status === "confirmed" || details?.status === "failed") {
      try {
        sessionStorage.removeItem(IN_FLIGHT_TRANSACTION_KEY);
      } catch {
        // Storage unavailable — nothing to clean up.
      }
    }
  }, [details?.status]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div role="status" className="flex items-center justify-center gap-3 text-[var(--text-muted)]">
          <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" />
          <span>Looking up transaction…</span>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h1 className="text-2xl font-bold mb-2">Could not load transaction</h1>
        <p className="text-[var(--text-muted)] mb-6">
          The lookup failed. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (loadState === "not-found" || !details) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h1 className="text-2xl font-bold mb-2" data-testid="tx-unknown">
          Transaction not found
        </h1>
        <p className="text-[var(--text-muted)] mb-6">
          No transaction matches the hash <code className="font-mono break-all">{hash}</code>.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--surface-2)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { status } = details;
  const isPending = status === "pending";
  const isConfirmed = status === "confirmed";

  return (
    <div
      className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
      data-testid="transaction-detail"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
        <div className="flex items-center gap-4">
          <a
            href={explorerTxUrl(details.network, hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--primary-light)] hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Stellar Expert
          </a>
          <button
            type="button"
            onClick={handleCopy}
            data-testid="copy-tx-link"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--primary-light)] hover:underline"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[var(--success)]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>

      <div
        data-testid={`tx-status-${status}`}
        className={`card p-6 mb-6 ${
          isConfirmed
            ? "border-[var(--success)]/30"
            : isPending
              ? "border-[var(--warning)]/30"
              : "border-[var(--error)]/30"
        }`}
      >
        <div className="flex items-center gap-3">
          {isConfirmed ? (
            <CheckCircle2 className="w-6 h-6 text-[var(--success)] flex-shrink-0" />
          ) : isPending ? (
            <Loader2 className="w-6 h-6 text-[var(--warning)] animate-spin motion-reduce:animate-none flex-shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-[var(--error)] flex-shrink-0" />
          )}
          <div>
            <h1 className="text-xl font-semibold">
              {isConfirmed
                ? "Transaction confirmed"
                : isPending
                  ? "Transaction in flight"
                  : "Transaction failed"}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {isPending
                ? "This transaction was submitted but hasn't been confirmed yet. This page refreshes automatically."
                : isConfirmed
                  ? "This transaction was confirmed and included in the ledger."
                  : "This transaction was included in the ledger but reported as failed."}
            </p>
          </div>
        </div>
        {isPending && (
          <div
            className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]"
            data-testid="tx-in-flight"
          >
            <span
              data-testid="tx-live-indicator"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
                liveTransport === "polling"
                  ? "bg-[var(--warning)]/15 text-[var(--warning)]"
                  : "bg-[var(--success)]/15 text-[var(--success)]"
              }`}
            >
              {liveTransport === "polling" ? (
                <WifiOff className="w-3.5 h-3.5" />
              ) : (
                <Radio className="w-3.5 h-3.5" />
              )}
              {liveTransport === "polling" ? "Polling" : "Live"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Refreshing every {IN_FLIGHT_POLL_MS / 1000}s as a fallback
            </span>
          </div>
        )}
      </div>

      <section aria-labelledby="tx-timeline" className="card p-6 mb-6">
        <h2 id="tx-timeline" className="text-lg font-semibold mb-4">
          Status timeline
        </h2>
        <ol data-testid="tx-timeline" className="space-y-0">
          <TimelineItem
            state={isPending ? "current" : "done"}
            title="Submitted"
            timestamp={
              details.createdAt
                ? new Date(details.createdAt).toLocaleString()
                : null
            }
            isLast={false}
          />
          <TimelineItem
            state={
              isPending ? "pending" : isConfirmed ? "done" : "failed"
            }
            title={
              isPending
                ? "Awaiting confirmation"
                : isConfirmed
                  ? "Confirmed"
                  : "Failed"
            }
            timestamp={
              isPending
                ? null
                : details.ledgerClosedAt
                  ? new Date(details.ledgerClosedAt).toLocaleString()
                  : null
            }
            isLast
          />
        </ol>
      </section>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Transaction details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <InfoRow label="Hash" mono>
            {details.hash}
          </InfoRow>
          <InfoRow label="Network">{details.network}</InfoRow>
          <InfoRow label="Status">
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </InfoRow>
          <InfoRow label="Submitted">
            {details.createdAt ? new Date(details.createdAt).toLocaleString() : "—"}
          </InfoRow>
          <InfoRow label="From">{details.fromAddress ?? "—"}</InfoRow>
          <InfoRow label="To">{details.toAddress ?? "—"}</InfoRow>
          <InfoRow label="Amount">
            {details.amount ? `${details.amount} ${details.asset ?? ""}`.trim() : "—"}
          </InfoRow>
          <InfoRow label="Asset">{details.asset ?? "—"}</InfoRow>
          <InfoRow label="Fee charged">{stroopsToXlm(details.feeChargedStroops)}</InfoRow>
          <InfoRow label="Fee offered">{stroopsToXlm(details.feeStroops)}</InfoRow>
          <InfoRow label="Ledger">{details.ledger ?? "—"}</InfoRow>
          <InfoRow label="Sequence">{details.sequence ?? "—"}</InfoRow>
          <InfoRow label="Memo">{details.memo || "—"}</InfoRow>
        </dl>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)] mb-1">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono break-all" : "break-words"}`}>
        {children}
      </dd>
    </div>
  );
}

/** One entry in the status timeline: a marker, a connector, and the title/time. */
function TimelineItem({
  state,
  title,
  timestamp,
  isLast,
}: {
  state: "done" | "current" | "pending" | "failed";
  title: string;
  timestamp: string | null;
  isLast: boolean;
}) {
  const dotClass =
    state === "done"
      ? "bg-[var(--success)]"
      : state === "failed"
        ? "bg-[var(--error)]"
        : state === "current"
          ? "bg-[var(--warning)] animate-pulse"
          : "bg-[var(--text-muted)]";
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full ${dotClass}`}
        >
          {state === "done" && <Check className="h-2.5 w-2.5 text-white" />}
        </span>
        {!isLast && (
          <span
            aria-hidden="true"
            className="w-px flex-1 min-h-[2.5rem] bg-[var(--border)]"
          />
        )}
      </div>
      <div className={isLast ? "pb-1" : "pb-6"}>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[var(--text-muted)]">
          {timestamp ??
            (state === "pending"
              ? "Waiting for the ledger to include this transaction…"
              : state === "current"
                ? "Submitted, waiting for confirmation…"
                : "—")}
        </p>
      </div>
    </li>
  );
}

