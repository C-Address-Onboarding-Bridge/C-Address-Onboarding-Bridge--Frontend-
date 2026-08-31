"use client";

/**
 * Embeddable funding widget (#558).
 *
 * A standalone page meant to be embedded in a third-party host's page —
 * either directly via `<iframe src="/widget?...">` or through the loader at
 * `public/aframp-widget.js` (see `docs/embedding.md`). Deliberately does not
 * import `WalletProvider`, the bridge page's step machine, or any app
 * routing/navigation: those pull in far more than a payment widget needs,
 * and the issue asks for this to stay small and standalone. Talks to
 * `window.parent` over postMessage instead (see `src/lib/widget.ts`).
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, Loader2, Wallet } from "lucide-react";
import {
  bridgeViaContract,
  connectWallet,
  getEstimatedFeeXLM,
  getExplorerUrl,
  isValidStellarAmount,
  toSafeErrorMessage,
} from "@/lib/stellar";
import {
  parseWidgetConfig,
  postWidgetMessage,
  type WidgetConfig,
  type WidgetOutboundMessage,
} from "@/lib/widget";

type Phase = "connect" | "form" | "signing" | "submitting" | "success" | "error";

function WidgetError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
      <AlertCircle className="h-5 w-5 text-red-500" />
      <p className="text-sm text-red-600">{message}</p>
    </div>
  );
}

function FundingWidget({ config }: { config: WidgetConfig }) {
  const [phase, setPhase] = useState<Phase>("connect");
  const [address, setAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState(config.amount);
  const [estimatedFee, setEstimatedFee] = useState("~0.00001 XLM");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const isDark = config.theme === "dark";

  // Tell the host we're up, and let it size the iframe to fit — the host
  // has no way to know our content height otherwise.
  useEffect(() => {
    postWidgetMessage(window.parent, { source: "aframp-widget", type: "ready" }, config.parentOrigin);
    const reportHeight = () =>
      postWidgetMessage(
        window.parent,
        { source: "aframp-widget", type: "resize", height: document.body.scrollHeight },
        config.parentOrigin
      );
    reportHeight();
    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [config.parentOrigin]);

  useEffect(() => {
    getEstimatedFeeXLM(config.network)
      .then(setEstimatedFee)
      .catch(() => {});
  }, [config.network]);

  function send(message: WidgetOutboundMessage) {
    postWidgetMessage(window.parent, message, config.parentOrigin);
  }

  async function handleConnect() {
    setError(null);
    const connected = await connectWallet();
    if (!connected) {
      setError("Couldn't connect a wallet. Make sure a Stellar wallet extension is installed and unlocked.");
      return;
    }
    setAddress(connected);
    setPhase("form");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!address) return;
    if (!isValidStellarAmount(amount)) {
      setError("Enter a valid amount (up to 7 decimal places).");
      return;
    }
    setError(null);
    setPhase("signing");
    try {
      const result = await bridgeViaContract(address, config.address, amount, config.asset, config.network, (p) =>
        setPhase(p)
      );
      setTxHash(result.hash);
      setPhase("success");
      send({ source: "aframp-widget", type: "success", txHash: result.hash, amount, asset: config.asset });
    } catch (cause) {
      const message = toSafeErrorMessage(cause, "Transaction failed. Please try again.");
      setError(message);
      setPhase("error");
      send({ source: "aframp-widget", type: "error", message });
    }
  }

  function handleCancel() {
    send({ source: "aframp-widget", type: "cancel" });
  }

  return (
    <div
      data-testid="widget-root"
      data-theme={config.theme}
      className={`flex min-h-dvh flex-col gap-4 p-5 ${isDark ? "bg-neutral-900 text-neutral-50" : "bg-white text-neutral-900"}`}
    >
      <header className="flex items-center justify-between">
        <p className="text-sm font-semibold">Fund with Aframp</p>
        <button
          type="button"
          onClick={handleCancel}
          className="text-xs text-neutral-500 hover:underline"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </header>

      {phase === "connect" && (
        <button
          type="button"
          onClick={handleConnect}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </button>
      )}

      {(phase === "form" || phase === "signing" || phase === "submitting" || phase === "error") && address && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="text-xs text-neutral-500">
            To <span className="font-mono">{config.address.slice(0, 8)}…{config.address.slice(-4)}</span>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Amount ({config.asset})
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!!config.amount || phase === "signing" || phase === "submitting"}
              className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-60"
            />
          </label>
          <p className="text-xs text-neutral-500">Estimated fee: {estimatedFee}</p>
          <button
            type="submit"
            disabled={phase === "signing" || phase === "submitting"}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {phase === "signing" || phase === "submitting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Send"
            )}
          </button>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
        </form>
      )}

      {phase === "success" && txHash && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Check className="h-6 w-6 text-emerald-600" />
          <p className="text-sm">Payment sent</p>
          <a
            href={getExplorerUrl(config.network, "tx", txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-700 hover:underline"
          >
            View transaction
          </a>
        </div>
      )}
    </div>
  );
}

function WidgetPageInner() {
  const searchParams = useSearchParams();
  const result = parseWidgetConfig(searchParams);

  if (!result.ok) {
    return <WidgetError message={result.error} />;
  }

  return <FundingWidget config={result.config} />;
}

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetPageInner />
    </Suspense>
  );
}
