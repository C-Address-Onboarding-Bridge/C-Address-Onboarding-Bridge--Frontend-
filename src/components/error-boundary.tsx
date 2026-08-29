"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { handleError } from "@/lib/errors";

/**
 * Session-storage key for a bridge transaction that was already submitted but
 * has not reached a terminal state. Written by the bridge page and read by the
 * error boundary so a crash never hides the fact that funds may be in motion.
 * (#473)
 */
export const IN_FLIGHT_TRANSACTION_KEY = "bridge:in-flight";

export interface InFlightTransaction {
  hash: string;
  network: string;
  from: string;
  to: string;
  amount: string;
  asset: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label passed to the telemetry path (handleError), e.g. "wallet". */
  context?: string;
  /** Custom fallback. When a function, receives the caught error. */
  fallback?: ReactNode | ((error: Error) => ReactNode);
  /** Called after the error has been reported. */
  onError?: (error: Error, info: { componentStack?: string | null }) => void;
  /** Called when the user presses "Try again". */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  inFlight: InFlightTransaction | null;
}

function readInFlightTransaction(): InFlightTransaction | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(IN_FLIGHT_TRANSACTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InFlightTransaction>;
    if (typeof parsed.hash !== "string" || !parsed.hash) return null;
    return {
      hash: parsed.hash,
      network: parsed.network ?? "",
      from: parsed.from ?? "",
      to: parsed.to ?? "",
      amount: parsed.amount ?? "",
      asset: parsed.asset ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * App-wide error boundary (#473).
 *
 * Every unexpected render error is reported through the app's central
 * `handleError` path (typed codes + console), and the user gets a recoverable
 * fallback with a "Try again" action instead of a white screen. When the crash
 * happened after a bridge transaction was submitted, the fallback surfaces a
 * link to the in-flight transaction's detail page so users can still track it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, inFlight: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Report through the existing telemetry path; never rethrow — the
    // boundary's own UI takes over here.
    handleError(error, this.props.context ?? "react-boundary");
    this.props.onError?.(error, { componentStack: info.componentStack ?? null });
    // Preserve any in-flight transaction so the fallback can point the user at
    // it instead of pretending nothing was submitted.
    this.setState({ inFlight: readInFlightTransaction() });
  }

  private handleRetry = () => {
    this.setState({ error: null, inFlight: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(error);
      }
      return this.props.fallback;
    }

    const { inFlight } = this.state;
    return (
      <div
        data-testid="error-boundary-fallback"
        role="alert"
        className="min-h-[60vh] flex items-center justify-center p-6"
      >
        <div className="card max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--error)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-[var(--error)]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            An unexpected error interrupted this page. Your connection and wallet are
            unaffected.
          </p>
          {inFlight && (
            <a
              href={`/transactions/${encodeURIComponent(inFlight.hash)}`}
              data-testid="in-flight-transaction-link"
              className="block mb-4 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-left"
            >
              <span className="block text-xs text-[var(--text-muted)] mb-1">
                A transaction was already submitted — it is still being confirmed:
              </span>
              <span className="block text-sm font-mono break-all text-[var(--primary-light)]">
                {inFlight.hash}
              </span>
            </a>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            data-testid="error-boundary-retry"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}


/**
 * Wallet-specific boundary. Wallet errors (Freighter missing, locked, network
 * mismatch) are the most likely source of a crash and the least likely to be
 * helped by a generic "Something went wrong", so they get their own fallback
 * with a targeted message. (#473)
 */
export function WalletErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      context="wallet"
      fallback={
        <div
          data-testid="wallet-error-boundary"
          role="alert"
          className="min-h-[60vh] flex items-center justify-center p-6"
        >
          <div className="card max-w-md w-full p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--error)]/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-[var(--error)]" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Wallet connection issue</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              The wallet layer hit an unexpected error. Refresh the page — your accounts
              and transactions are safe.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
