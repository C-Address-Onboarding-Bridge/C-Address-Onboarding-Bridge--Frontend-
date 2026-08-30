"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRightLeft, Wallet, Send, ArrowRight, Check, AlertCircle, Loader2, ExternalLink, Link2, Copy, QrCode as QrCodeIcon } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import { isValidStellarAddress, isCAddress, isValidStellarAmount, bridgeViaContract, getExplorerUrl, getAccountBalances, getAccountMinimumBalance, formatNetworkLabel, getEstimatedFeeXLM, toSafeErrorMessage } from "@/lib/stellar";
import type { AccountBalances } from "@/lib/stellar";
import { useDebounce } from "@/hooks/useDebounce";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import LiveRegion from "@/components/live-region";
import QrCode from "@/components/qr-code";
import { buildFundingLink, parseFundingLink, hasFundingLinkParams, FUNDING_LINK_ASSETS } from "@/lib/fundingLink";
import type { FundingLinkAsset } from "@/lib/fundingLink";

type Step = "form" | "review" | "confirm";
type TxStatus = "idle" | "signing" | "submitting" | "success" | "error";
type PageView = "send" | "request";

// Classic Stellar payments cannot target a Soroban C-address, and the
// Soroban smart-contract transfer path (SAC invocation via prepareTransaction)
// hasn't shipped yet — see issue #284. Block submission with an honest
// message instead of letting users hit an opaque "destination is invalid"
// error after signing.
const BRIDGING_UNAVAILABLE_MESSAGE =
  "G → C bridging isn't live yet: classic Stellar payments can't reach Soroban contract addresses, and the Soroban transfer path hasn't shipped. Follow progress in issue #284.";

export default function BridgePage() {
  const {
    isConnected,
    address,
    network,
    networkStatus,
    walletNetworkName,
    isNetworkSupported,
    connect,
  } = useWallet();
  const searchParams = useSearchParams();
  const { copy, status: copyStatus } = useCopyToClipboard();

  // The source is always Freighter's connected account, never free text.
  // Freighter signs with its active account regardless of what the transaction
  // names as its source, so any other value could only ever produce a
  // tx_bad_auth failure after the user had already approved the signature. (#287)
  const fromAddress = address ?? "";
  const [step, setStep] = useState<Step>("form");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [sourceBalances, setSourceBalances] = useState<AccountBalances | null>(null);
  // Fee estimate fetched from Horizon when the user moves to the review step.
  // Falls back to the static placeholder if the fetch fails. (#257)
  const FALLBACK_FEE = "~0.00001 XLM";
  const [estimatedFee, setEstimatedFee] = useState<string>(FALLBACK_FEE);

  // Page view: "send" (default bridge form) or "request" (request-funds + QR)
  const [pageView, setPageView] = useState<PageView>("send");

  // Request-funds form state (independent from the send form)
  const [requestTarget, setRequestTarget] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [requestAsset, setRequestAsset] = useState<FundingLinkAsset>("XLM");

  // Link-param parse error (shown when the URL contains bad query params)
  // Parsed once from searchParams using a lazy initializer — avoids setState
  // calls inside a useEffect and ensures the values are available on the
  // first render without an extra cycle. (#460)
  const [linkParamError] = useState<string | null>(() => {
    if (!hasFundingLinkParams(searchParams)) return null;
    const result = parseFundingLink(searchParams);
    return result.ok ? null : result.message;
  });

  // Pre-fill toAddress / amount / asset from query params on first render.
  // Using lazy useState initializers so the values are set synchronously
  // without triggering a setState-in-effect lint violation. (#460)
  const [toAddress, setToAddress] = useState(() => {
    if (!hasFundingLinkParams(searchParams)) return "";
    const result = parseFundingLink(searchParams);
    return result.ok ? result.params.target : "";
  });
  const [amount, setAmount] = useState(() => {
    if (!hasFundingLinkParams(searchParams)) return "";
    const result = parseFundingLink(searchParams);
    return (result.ok && result.params.amount) ? result.params.amount : "";
  });
  const [asset, setAsset] = useState(() => {
    if (!hasFundingLinkParams(searchParams)) return "XLM";
    const result = parseFundingLink(searchParams);
    return (result.ok && result.params.asset) ? result.params.asset : "XLM";
  });

  const validFrom = !fromAddress || isValidStellarAddress(fromAddress);
  // Debounce address/amount validation to avoid running StrKey CRC checks on
  // every keystroke — validation fires 300 ms after the user stops typing.
  const debouncedToAddress = useDebounce(toAddress, 300);
  const debouncedAmount = useDebounce(amount, 300);
  const validTo = !debouncedToAddress || (isValidStellarAddress(debouncedToAddress) && isCAddress(debouncedToAddress));
  const networkLabel = formatNetworkLabel(networkStatus, walletNetworkName);
  const validAmount = !debouncedAmount || isValidStellarAmount(debouncedAmount);

  // Balances are only meaningful for a connected wallet on a supported
  // network; anything cached from before a disconnect or a switch to an
  // unsupported network is hidden rather than shown as current. (#289)
  const activeBalances = isConnected && isNetworkSupported ? sourceBalances : null;

  // Balance available for the currently-selected asset. XLM lives in `total`;
  // other assets (e.g. USDC) come from the matching entry in `balances`.
  // Only the asset dropdown and the fetched balances should trigger this
  // lookup — memoized so typing in the address/amount fields on every
  // keystroke doesn't re-run the `.find()` over the balances list. (#366)
  const availableBalance = useMemo(
    () =>
      activeBalances === null
        ? null
        : asset === "XLM"
          ? activeBalances.total
          : (activeBalances.balances.find((b) => b.asset === asset)?.amount ?? "0"),
    [activeBalances, asset]
  );

  // Spendable balance leaves the XLM minimum reserve untouched; the reserve is
  // only held in XLM, so non-XLM assets can be sent down to zero.
  const spendableBalance = useMemo(
    () =>
      availableBalance === null
        ? null
        : asset === "XLM"
          ? Number(availableBalance) - Number(getAccountMinimumBalance())
          : Number(availableBalance),
    [availableBalance, asset]
  );

  const insufficientBalance =
    spendableBalance !== null &&
    amount !== "" &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) > spendableBalance;

  // No Soroban transfer path is implemented yet, so no destination this form
  // accepts (validTo requires a C-address) can actually be bridged. See #284.
  const bridgingBlocked = Boolean(debouncedToAddress) && validTo;

  const canProceed =
    isConnected &&
    isNetworkSupported &&
    fromAddress &&
    toAddress &&
    amount &&
    validFrom &&
    validTo &&
    !insufficientBalance &&
    !bridgingBlocked &&
    debouncedToAddress === toAddress &&
    debouncedAmount === amount &&
    txStatus === "idle";

  // Balances follow the connected account: no manual "use connected wallet"
  // step, and a network switch re-reads them against the right chain. A slow
  // response for the previous account/network must not overwrite fresh data.
  useEffect(() => {
    if (!address || !isNetworkSupported) return;
    let cancelled = false;
    getAccountBalances(address, network).then((result) => {
      if (!cancelled) setSourceBalances(result);
    });
    return () => {
      cancelled = true;
    };
  }, [address, network, isNetworkSupported]);

  const handleSubmit = () => {
    if (!canProceed) return;
    setStep("review");
    setTxError(null);
    // Fetch a fresh fee estimate in the background; if it fails the
    // fallback value already set in state is shown instead. (#257)
    getEstimatedFeeXLM(network).then((fee) => setEstimatedFee(fee)).catch(() => {
      // getEstimatedFeeXLM never throws (it falls back internally), but
      // guard here for defence in depth.
      setEstimatedFee(FALLBACK_FEE);
    });
  };

  const handleConfirm = async () => {
    if (!fromAddress || !toAddress || !amount) return;
    // Never build against a network the app only guessed at. (#289)
    if (!isNetworkSupported) {
      setTxError(
        networkStatus === "UNSUPPORTED"
          ? `Freighter is on ${networkLabel}. Switch to Testnet or Mainnet to use the bridge.`
          : "Freighter's network couldn't be read. Unlock the extension and reload before submitting."
      );
      setTxStatus("error");
      return;
    }
    setTxStatus("signing");
    setTxError(null);

    try {
      const result = await bridgeViaContract(
        fromAddress,
        toAddress,
        amount,
        asset,
        network,
        (phase) => setTxStatus(phase)
      );
      setTxHash(result.hash);
      setTxStatus("success");
      setStep("confirm");
    } catch (e: unknown) {
      setTxError(toSafeErrorMessage(e, "Transaction failed. Please try again."));
      setTxStatus("error");
    }
  };

  const handleReset = () => {
    setStep("form");
    setTxStatus("idle");
    setTxHash(null);
    setTxError(null);
  };

  // --- Request-funds helpers ---

  // Validate the request-funds target address
  const debouncedRequestTarget = useDebounce(requestTarget, 300);
  const validRequestTarget =
    !debouncedRequestTarget || isValidStellarAddress(debouncedRequestTarget);

  // Build the funding link from the current page URL + request params
  const fundingLink = useMemo(() => {
    if (!requestTarget || !isValidStellarAddress(requestTarget)) return "";
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/bridge`
        : "/bridge";
    return buildFundingLink(baseUrl, {
      target: requestTarget,
      ...(requestAmount && isValidStellarAmount(requestAmount) ? { amount: requestAmount } : {}),
      ...(requestAsset !== "XLM" ? { asset: requestAsset } : {}),
    });
  }, [requestTarget, requestAmount, requestAsset]);

  // Announcements for screen readers, derived from the existing status state.
  // The visible UI copy is unchanged; these strings follow exactly the wording
  // requested in #224 and the same sense as the visible button/screen copy.
  // Two permanently-mounted regions avoid the "some AT cache the politeness
  // value on first registration" pitfall — whichever isn't active is simply
  // left as the empty string so only one ever has content.
  const isTxError = txStatus === "error";
  const politeAnnouncement =
    copyStatus === "copied"
      ? "Link copied to clipboard."
      : txStatus === "signing"
        ? "Signing transaction."
        : txStatus === "submitting"
          ? "Submitting transaction."
          : txStatus === "success"
            ? "Transaction submitted successfully."
            : "";
  const assertiveAnnouncement = isTxError
    ? `Transaction failed. ${txError ?? "An unexpected error occurred."}`
    : copyStatus === "error"
      ? "Failed to copy link to clipboard."
      : "";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">G → C Bridge</h1>
        <p className="text-[var(--text-muted)]">
          Fund a Soroban smart account (C-address) from an existing Stellar G-address.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6" role="tablist" aria-label="Bridge views">
        <button
          role="tab"
          aria-selected={pageView === "send"}
          aria-controls="panel-send"
          id="tab-send"
          onClick={() => setPageView("send")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            pageView === "send"
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]/80"
          }`}
        >
          <Send className="w-4 h-4" />
          Send funds
        </button>
        <button
          role="tab"
          aria-selected={pageView === "request"}
          aria-controls="panel-request"
          id="tab-request"
          onClick={() => setPageView("request")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            pageView === "request"
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]/80"
          }`}
        >
          <QrCodeIcon className="w-4 h-4" />
          Request funds
        </button>
      </div>

      <LiveRegion message={politeAnnouncement} />
      <LiveRegion politeness="assertive" message={assertiveAnnouncement} />

      {/* Link-param parse error banner */}
      {linkParamError && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3" role="alert">
          <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--error)]">Invalid funding link</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{linkParamError}</p>
          </div>
        </div>
      )}

      {/* Send funds panel */}
      <div
        id="panel-send"
        role="tabpanel"
        aria-labelledby="tab-send"
        hidden={pageView !== "send"}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="card p-6">
              {step === "form" && (
                <div className="space-y-6">
                  {isConnected && !isNetworkSupported && (
                    <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-[var(--error)]">
                          {networkStatus === "UNSUPPORTED"
                            ? `Freighter is on ${networkLabel}`
                            : "Freighter's network couldn't be read"}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {networkStatus === "UNSUPPORTED"
                            ? "Switch to Testnet or Mainnet in Freighter to use the bridge. Balances and transactions are blocked until then, because the app can't tell which chain to use."
                            : "Unlock the Freighter extension and reload the page. Nothing is submitted while the network is unknown — assuming Testnet would build transactions for the wrong chain."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Pre-filled from link banner */}
                  {hasFundingLinkParams(searchParams) && !linkParamError && (
                    <div className="p-3 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-[var(--primary-light)] flex-shrink-0" />
                      <p className="text-xs text-[var(--text-muted)]">
                        Destination pre-filled from a funding request link.
                      </p>
                    </div>
                  )}

                  <div>
                    <label htmlFor="from-address" className="block text-sm font-medium mb-2">
                      From (connected wallet)
                    </label>
                    {isConnected ? (
                      <>
                        <div className="relative">
                          <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                          <input
                            id="from-address"
                            type="text"
                            value={fromAddress}
                            readOnly
                            aria-describedby="from-address-help"
                            className="w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono text-[var(--text-muted)] cursor-not-allowed focus:outline-none"
                          />
                        </div>
                        <p id="from-address-help" className="text-xs text-[var(--text-muted)] mt-1">
                          Freighter signs with its active account, so the source must be the connected
                          wallet. To send from a different account, switch accounts in Freighter.
                        </p>
                      </>
                    ) : (
                      <div className="p-4 rounded-lg bg-[var(--surface-2)] border border-dashed border-[var(--border)] flex items-center justify-between gap-3">
                        <p className="text-xs text-[var(--text-muted)]">
                          Connect Freighter to choose the source account.
                        </p>
                        <button
                          onClick={connect}
                          className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:bg-[var(--primary)]/90 transition-colors"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          Connect Wallet
                        </button>
                      </div>
                    )}
                    {!validFrom && fromAddress && (
                      <p className="text-xs text-[var(--error)] mt-1">Invalid Stellar address</p>
                    )}
                    {availableBalance !== null && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Balance: {parseFloat(availableBalance).toFixed(2)} {asset}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                      <ArrowRightLeft className="w-5 h-5 text-[var(--primary-light)]" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="to-address" className="block text-sm font-medium mb-2">To (C-address)</label>
                    <div className="relative">
                      <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                      <input
                        id="to-address"
                        type="text"
                        value={toAddress}
                        onChange={(e) => setToAddress(e.target.value)}
                        placeholder="CABC...DEF"
                        aria-invalid={!validTo && !!toAddress}
                        aria-describedby={!validTo && toAddress ? "to-address-error" : undefined}
                        className="w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-[var(--primary)] transition-colors"
                        disabled={txStatus !== "idle"}
                      />
                    </div>
                    {!validTo && toAddress && (
                      <p id="to-address-error" className="text-xs text-[var(--error)] mt-1" role="alert">
                        Invalid C-address (must start with C and be 56 characters)
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="bridge-amount" className="block text-sm font-medium mb-2">Amount</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <input
                          id="bridge-amount"
                          type="text"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          aria-invalid={(!validAmount && !!amount) || insufficientBalance}
                          aria-describedby={
                            (!validAmount && amount) ? "amount-format-error" :
                            insufficientBalance ? "amount-balance-error" : undefined
                          }
                          className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
                          disabled={txStatus !== "idle"}
                        />
                        {spendableBalance !== null && spendableBalance > 0 && txStatus === "idle" && (
                          <button
                            type="button"
                            onClick={() => setAmount(Math.max(spendableBalance, 0).toFixed(7))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-xs font-semibold bg-[var(--primary)]/10 text-[var(--primary-light)] hover:bg-[var(--primary)]/20 transition-colors"
                            aria-label="Fill maximum available balance"
                          >
                            Max
                          </button>
                        )}
                      </div>
                      <select
                        value={asset}
                        onChange={(e) => setAsset(e.target.value as FundingLinkAsset)}
                        aria-label="Asset to send"
                        className="px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
                        disabled={txStatus !== "idle"}
                      >
                        <option>XLM</option>
                        <option>USDC</option>
                      </select>
                    </div>
                    {!validAmount && debouncedAmount && (
                      <p className="text-xs text-[var(--error)] mt-1">
                        Invalid amount. Enter a positive number with up to 7 decimal places (e.g. &quot;10&quot; or &quot;0.5&quot;).
                      </p>
                    )}
                    {insufficientBalance && (
                      <p id="amount-balance-error" className="text-xs text-[var(--error)] mt-1" role="alert">
                        Insufficient balance. Available:{" "}
                        {spendableBalance !== null ? Math.max(spendableBalance, 0).toFixed(2) : "0.00"} {asset}
                        {asset === "XLM" ? " (after minimum reserve)" : ""}
                      </p>
                    )}
                  </div>

                  {bridgingBlocked && (
                    <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-[var(--text-muted)]">{BRIDGING_UNAVAILABLE_MESSAGE}</p>
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={!canProceed}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    Review Bridge Transaction
                  </button>
                </div>
              )}

              {step === "review" && (
                <div className="space-y-6">
                  <h3 className="font-semibold text-lg">Review Transaction</h3>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
                      <span className="text-sm text-[var(--text-muted)]">From</span>
                      <span className="text-sm font-mono">{fromAddress}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
                      <span className="text-sm text-[var(--text-muted)]">To</span>
                      <span className="text-sm font-mono">{toAddress}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
                      <span className="text-sm text-[var(--text-muted)]">Amount</span>
                      <span className="text-sm font-semibold">{amount} {asset}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
                      <span className="text-sm text-[var(--text-muted)]">Network</span>
                      <span className="text-sm">{networkLabel}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
                      <span className="text-sm text-[var(--text-muted)]">Fee</span>
                      <span className="text-sm">{estimatedFee}</span>
                    </div>
                  </div>

                  {txError && (
                    <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-[var(--error)]">Transaction Failed</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">{txError}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleReset}
                      disabled={txStatus === "signing" || txStatus === "submitting"}
                      className="flex-1 px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={txStatus === "signing" || txStatus === "submitting"}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50"
                    >
                      {txStatus === "signing" || txStatus === "submitting" ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                          {txStatus === "signing" ? "Signing..." : "Submitting..."}
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          Confirm & Sign
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {step === "confirm" && txStatus === "success" && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-[var(--success)]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Transaction Submitted</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    Your bridge transaction has been submitted to the network.
                  </p>
                  {txHash && (
                    <a
                      href={getExplorerUrl(network, "tx", txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-[var(--primary-light)] hover:underline mb-6"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View on Stellar Expert
                    </a>
                  )}
                  <div className="mt-4">
                    <button
                      onClick={handleReset}
                      className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
                    >
                      New Bridge Transaction
                    </button>
                  </div>
                </div>
              )}

              {step === "confirm" && txStatus === "error" && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-[var(--error)]/10 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-[var(--error)]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Transaction Failed</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-6">{txError || "An unexpected error occurred"}</p>
                  <button
                    onClick={() => { setStep("review"); setTxStatus("idle"); setTxError(null); }}
                    className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="font-semibold mb-3">About G → C Bridging</h3>
              <ul className="space-y-3 text-sm text-[var(--text-muted)]">
                <li className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-[var(--error)] flex-shrink-0 mt-0.5" />
                  <span>Not yet available — the Soroban contract-transfer step hasn&apos;t shipped (issue #284)</span>
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 text-[var(--success)] flex-shrink-0 mt-0.5" />
                  <span>Will support XLM or USDC from any G-address once live</span>
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 text-[var(--success)] flex-shrink-0 mt-0.5" />
                  <span>Low network fees via Stellar network</span>
                </li>
              </ul>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold mb-3">Quick Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Network</span>
                  <span className="font-mono text-xs">{isConnected ? networkStatus : network}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Bridge Contract</span>
                  <span className="font-mono text-xs">v0.1.0</span>
                </div>
              </div>
            </div>

            {!isConnected && (
              <button
                onClick={connect}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--primary)]/30 text-[var(--primary-light)] font-medium hover:bg-[var(--primary)]/5 transition-colors text-sm"
              >
                <Wallet className="w-4 h-4" />
                Connect Freighter Wallet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Request funds panel */}
      <div
        id="panel-request"
        role="tabpanel"
        aria-labelledby="tab-request"
        hidden={pageView !== "request"}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: form */}
          <div className="card p-6 space-y-6">
            <div>
              <h2 className="font-semibold text-lg mb-1">Request funds</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Enter your address to generate a shareable link and QR code. The funder
                opens the link and your address is pre-filled — no copy-paste required.
              </p>
            </div>

            <div>
              <label htmlFor="request-target" className="block text-sm font-medium mb-2">
                Your address (destination)
              </label>
              <input
                id="request-target"
                type="text"
                value={requestTarget}
                onChange={(e) => setRequestTarget(e.target.value)}
                placeholder="G… or C…"
                aria-invalid={!validRequestTarget && !!requestTarget}
                aria-describedby={!validRequestTarget && requestTarget ? "request-target-error" : "request-target-help"}
                className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
              {!validRequestTarget && requestTarget ? (
                <p id="request-target-error" className="text-xs text-[var(--error)] mt-1" role="alert">
                  Not a valid Stellar address.
                </p>
              ) : (
                <p id="request-target-help" className="text-xs text-[var(--text-muted)] mt-1">
                  The address that will receive the funds.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="request-amount" className="block text-sm font-medium mb-2">
                Suggested amount <span className="text-[var(--text-muted)] font-normal">(optional)</span>
              </label>
              <input
                id="request-amount"
                type="text"
                value={requestAmount}
                onChange={(e) => setRequestAmount(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>

            <div>
              <label htmlFor="request-asset" className="block text-sm font-medium mb-2">
                Asset
              </label>
              <select
                id="request-asset"
                value={requestAsset}
                onChange={(e) => setRequestAsset(e.target.value as FundingLinkAsset)}
                className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
              >
                {FUNDING_LINK_ASSETS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Generated link + copy button */}
            {fundingLink && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">Funding link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fundingLink}
                    readOnly
                    aria-label="Generated funding link"
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)] focus:outline-none overflow-hidden text-ellipsis"
                  />
                  <button
                    onClick={() => copy(fundingLink)}
                    aria-label={copyStatus === "copied" ? "Link copied" : "Copy funding link"}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      copyStatus === "copied"
                        ? "bg-[var(--success)]/10 text-[var(--success)]"
                        : "bg-[var(--primary)]/10 text-[var(--primary-light)] hover:bg-[var(--primary)]/20"
                    }`}
                  >
                    {copyStatus === "copied" ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copyStatus === "copied" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: QR code */}
          <div className="card p-6 flex flex-col items-center justify-center gap-4">
            {fundingLink ? (
              <>
                <QrCode
                  value={fundingLink}
                  size={256}
                  label={`QR code for funding request to ${requestTarget.slice(0, 8)}…`}
                />
                <p className="text-xs text-[var(--text-muted)] text-center max-w-[260px]">
                  Scan to open the bridge form with your address pre-filled.
                  The QR code is generated locally — your address never leaves this browser.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
                <QrCodeIcon className="w-16 h-16 opacity-20" />
                <p className="text-sm text-center">
                  Enter a valid address to generate the QR code.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
