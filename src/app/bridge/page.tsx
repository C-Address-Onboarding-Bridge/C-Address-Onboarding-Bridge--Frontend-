"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Wallet, Send, ArrowRight, Check, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import { isValidStellarAddress, isCAddress, isValidStellarAmount, bridgeViaContract, getExplorerUrl, getAccountBalances, getAccountMinimumBalance, formatNetworkLabel, getEstimatedFeeXLM, toSafeErrorMessage } from "@/lib/stellar";
import type { AccountBalances } from "@/lib/stellar";
import { useDebounce } from "@/hooks/useDebounce";
import { useStepTransition } from "@/hooks/useStepTransition";
import LiveRegion from "@/components/live-region";

type Step = "form" | "review" | "confirm";
type TxStatus = "idle" | "signing" | "submitting" | "success" | "error";

// Classic Stellar payments cannot target a Soroban C-address, and the
// Soroban smart-contract transfer path (SAC invocation via prepareTransaction)
// hasn't shipped yet — see issue #284. Block submission with an honest
// message instead of letting users hit an opaque "destination is invalid"
// error after signing.
const BRIDGING_UNAVAILABLE_MESSAGE =
  "G → C bridging isn't live yet: classic Stellar payments can't reach Soroban contract addresses, and the Soroban transfer path hasn't shipped. Follow progress in issue #284.";

// Mobile wallet approval/signing can hand off to a separate wallet app (or,
// on some mobile browsers, just get the tab suspended or reloaded outright)
// and back. sessionStorage survives that round trip even when React state
// doesn't, so the in-progress form is mirrored there continuously and
// restored on the way back in. Only "form"/"review" are ever persisted — a
// finished ("confirm") flow has nothing worth resurrecting. (#487)
const BRIDGE_FORM_STORAGE_KEY = "bridge:form-state:v1";

type PersistedStep = Extract<Step, "form" | "review">;

interface PersistedBridgeFormState {
  toAddress: string;
  amount: string;
  asset: string;
  step: PersistedStep;
}

function isPersistedStep(value: unknown): value is PersistedStep {
  return value === "form" || value === "review";
}

/** Reads the saved form snapshot. Any storage/parse failure yields null so callers can fall back to defaults. */
function readPersistedFormState(): PersistedBridgeFormState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BRIDGE_FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.toAddress !== "string" ||
      typeof candidate.amount !== "string" ||
      typeof candidate.asset !== "string" ||
      !isPersistedStep(candidate.step)
    ) {
      return null;
    }
    return candidate as unknown as PersistedBridgeFormState;
  } catch {
    return null;
  }
}

function writePersistedFormState(state: PersistedBridgeFormState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BRIDGE_FORM_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort only — private browsing or a full quota shouldn't break the form.
  }
}

function clearPersistedFormState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(BRIDGE_FORM_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function BridgePage() {
  const {
    isConnected,
    address,
    network,
    networkStatus,
    walletNetworkName,
    isNetworkSupported,
    isOnline,
    connect,
  } = useWallet();
  // The source is always Freighter's connected account, never free text.
  // Freighter signs with its active account regardless of what the transaction
  // names as its source, so any other value could only ever produce a
  // tx_bad_auth failure after the user had already approved the signature. (#287)
  const fromAddress = address ?? "";
  // Lazy initializers so a returning tab (post wallet-handoff reload) restores
  // whatever was in progress instead of starting from a blank form. (#487)
  const [toAddress, setToAddress] = useState(() => readPersistedFormState()?.toAddress ?? "");
  const [amount, setAmount] = useState(() => readPersistedFormState()?.amount ?? "");
  const [asset, setAsset] = useState(() => readPersistedFormState()?.asset ?? "XLM");
  const [step, setStep] = useState<Step>(() => readPersistedFormState()?.step ?? "form");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [sourceBalances, setSourceBalances] = useState<AccountBalances | null>(null);
  // Fee estimate fetched from Horizon when the user moves to the review step.
  // Falls back to the static placeholder if the fetch fails. (#257)
  const FALLBACK_FEE = "~0.00001 XLM";
  const [estimatedFee, setEstimatedFee] = useState<string>(FALLBACK_FEE);

  // Keyboard + screen-reader step transitions: focus the new step's heading and
  // announce the change. Implemented in useStepTransition. (#476)
  const { headingRef, announcement: stepAnnouncement } = useStepTransition(step);

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
    isOnline &&
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

  // Mirror the in-progress form to sessionStorage on every change so it's
  // always up to date by the time a wallet approval/signing handoff happens —
  // there's no single "about to redirect" moment to hook for a browser
  // extension wallet, so continuous persistence covers it instead. Cleared
  // once the flow reaches "confirm" (success or error) since there's nothing
  // in-progress left to restore. (#487)
  useEffect(() => {
    if (step === "confirm") {
      clearPersistedFormState();
      return;
    }
    writePersistedFormState({ toAddress, amount, asset, step });
  }, [toAddress, amount, asset, step]);

  // Recover from a backgrounded/killed tab: mobile browsers can reload this
  // page (or restore it from the back-forward cache) after the user returns
  // from approving/signing in a wallet app. `visibilitychange` and `pageshow`
  // both fire on that return; either can be all a given browser gives us, so
  // both are handled the same way. Only fields still at their untouched
  // default are filled in — anything the user has already typed here wins. (#487)
  useEffect(() => {
    const restoreFromStorage = () => {
      const persisted = readPersistedFormState();
      if (!persisted) return;
      setToAddress((prev) => (prev === "" ? persisted.toAddress : prev));
      setAmount((prev) => (prev === "" ? persisted.amount : prev));
      setAsset((prev) => (prev === "XLM" && persisted.toAddress !== "" ? persisted.asset : prev));
      setStep((prev) => (prev === "form" ? persisted.step : prev));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") restoreFromStorage();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", restoreFromStorage);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", restoreFromStorage);
    };
  }, []);

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

  // Announcements for screen readers, derived from the existing status state.
  // The visible UI copy is unchanged; these strings follow exactly the wording
  // requested in #224 and the same sense as the visible button/screen copy.
  // Two permanently-mounted regions avoid the "some AT cache the politeness
  // value on first registration" pitfall — whichever isn't active is simply
  // left as the empty string so only one ever has content.
  const isTxError = txStatus === "error";
  const politeAnnouncement =
    txStatus === "signing"
      ? "Signing transaction."
      : txStatus === "submitting"
        ? "Submitting transaction."
        : txStatus === "success"
          ? "Transaction submitted successfully."
          : "";
  const assertiveAnnouncement = isTxError
    ? `Transaction failed. ${txError ?? "An unexpected error occurred."}`
    : "";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">G → C Bridge</h1>
        <p className="text-[var(--text-muted)]">
          Fund a Soroban smart account (C-address) from an existing Stellar G-address.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="card p-4 sm:p-6">
            <LiveRegion message={politeAnnouncement} />
            <LiveRegion politeness="assertive" message={assertiveAnnouncement} />
            <LiveRegion message={stepAnnouncement} />
            {step === "form" && (
              <div className="space-y-6">
                <h2
                  id="step-form-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold mb-4 focus:outline-none"
                >
                  Enter Bridge Details
                </h2>

                {!isOnline && (
                  <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-[var(--text-muted)]">
                      You&apos;re offline, so the bridge can&apos;t submit right now.
                      Your details are kept; reconnect to send the transaction.
                    </p>
                  </div>
                )}
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
                          className="w-full pl-10 pr-4 py-3 min-h-[44px] rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono text-[var(--text-muted)] cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                        />
                      </div>
                      <p id="from-address-help" className="text-xs text-[var(--text-muted)] mt-1">
                        Freighter signs with its active account, so the source must be the connected
                        wallet. To send from a different account, switch accounts in Freighter.
                      </p>
                    </>
                  ) : (
                    <div className="p-4 rounded-lg bg-[var(--surface-2)] border border-dashed border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-xs text-[var(--text-muted)]">
                        Connect Freighter to choose the source account.
                      </p>
                      <button
                        onClick={connect}
                        className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] w-full sm:w-auto rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:bg-[var(--primary)]/90 transition-colors"
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
                        className="w-full pl-10 pr-4 py-3 min-h-[44px] rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
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
                  {/* Stacks below `sm` so the asset select gets a full-width, comfortably
                      tappable target instead of being squeezed next to the amount field. (#487) */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <input
                        id="bridge-amount"
                        type="text"
                        // Numeric amounts need the decimal point too (Stellar amounts allow
                        // up to 7 decimal places), so `inputMode="decimal"` — not "numeric" —
                        // brings up a digit keyboard that still has a "." key. The `pattern`
                        // is kept as a fallback hint for browsers that key off it instead. (#487)
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        aria-invalid={(!validAmount && !!amount) || insufficientBalance}
                        aria-describedby={
                          (!validAmount && amount) ? "amount-format-error" :
                          insufficientBalance ? "amount-balance-error" : undefined
                        }
                        className="w-full px-4 py-3 min-h-[44px] rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
                        disabled={txStatus !== "idle"}
                      />
                      {spendableBalance !== null && spendableBalance > 0 && txStatus === "idle" && (
                        <button
                          type="button"
                          onClick={() => setAmount(Math.max(spendableBalance, 0).toFixed(7))}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 min-h-[36px] rounded text-xs font-semibold bg-[var(--primary)]/10 text-[var(--primary-light)] hover:bg-[var(--primary)]/20 transition-colors"
                          aria-label="Fill maximum available balance"
                        >
                          Max
                        </button>
                      )}
                    </div>
                    <select
                      value={asset}
                      onChange={(e) => setAsset(e.target.value)}
                      aria-label="Asset to send"
                      className="px-4 py-3 min-h-[44px] w-full sm:w-auto rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
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
                  aria-disabled={!canProceed}
                  title={!isOnline ? "Reconnect to the network to continue" : undefined}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
                >
                  <Send className="w-4 h-4" />
                  Review Bridge Transaction
                </button>
              </div>
            )}

            {step === "review" && (
              <div className="space-y-6">
                <h2
                  id="step-review-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-semibold text-lg focus:outline-none"
                >
                  Review Transaction
                </h2>

                {/* Rows stack label-over-value below `sm` — a 56-character address held
                    to one line next to a label would either overflow the card or get
                    squeezed unreadably small on a phone-width screen. (#487) */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 p-4 rounded-lg bg-[var(--surface-2)]">
                    <span className="text-sm text-[var(--text-muted)]">From</span>
                    <span className="text-sm font-mono break-all">{fromAddress}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 p-4 rounded-lg bg-[var(--surface-2)]">
                    <span className="text-sm text-[var(--text-muted)]">To</span>
                    <span className="text-sm font-mono break-all">{toAddress}</span>
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
                    className="flex-1 px-6 py-3 min-h-[44px] rounded-xl border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={txStatus === "signing" || txStatus === "submitting" || !isOnline}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
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
                <h2
                  id="step-confirm-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold mb-2 focus:outline-none"
                >
                  Transaction Submitted
                </h2>
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
                    className="px-6 py-3 min-h-[44px] rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
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
                <h2
                  id="step-confirm-error-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold mb-2 focus:outline-none"
                >
                  Transaction Failed
                </h2>
                <p className="text-sm text-[var(--text-muted)] mb-6">{txError || "An unexpected error occurred"}</p>
                <button
                  onClick={() => { setStep("review"); setTxStatus("idle"); setTxError(null); }}
                  className="px-6 py-3 min-h-[44px] rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
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
              className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-[var(--primary)]/30 text-[var(--primary-light)] font-medium hover:bg-[var(--primary)]/5 transition-colors text-sm"
            >
              <Wallet className="w-4 h-4" />
              Connect Freighter Wallet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
