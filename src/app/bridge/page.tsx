"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Wallet, Send, ArrowRight, Check, AlertCircle, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { useWallet } from "@/components/wallet-provider";
import { isValidStellarAddress, isCAddress, isValidStellarAmount, bridgeViaContract, getExplorerUrl, getAccountBalances, getAccountMinimumBalance, formatNetworkLabel, getEstimatedFeeXLM, toSafeErrorMessage, shouldWarnOnMainnetAction } from "@/lib/stellar";
import type { AccountBalances, SimulationResult } from "@/lib/stellar";
import { useDebounce } from "@/hooks/useDebounce";
import { useStepTransition } from "@/hooks/useStepTransition";
import LiveRegion from "@/components/live-region";
import { addNotification } from "@/lib/notifications";

type Step = "form" | "review" | "confirm";
type TxStatus = "idle" | "signing" | "submitting" | "success" | "error";

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
    isOnline,
    recentlyChangedNetwork,
    connect,
  } = useWallet();
  // The source is always Freighter's connected account, never free text.
  // Freighter signs with its active account regardless of what the transaction
  // names as its source, so any other value could only ever produce a
  // tx_bad_auth failure after the user had already approved the signature. (#287)
  const fromAddress = address ?? "";
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState("XLM");
  const [step, setStep] = useState<Step>("form");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [sourceBalances, setSourceBalances] = useState<AccountBalances | null>(null);
  // Fee estimate fetched from Horizon when the user moves to the review step.
  // Falls back to the static placeholder if the fetch fails. (#257)
  const FALLBACK_FEE = "~0.00001 XLM";
  const [estimatedFee, setEstimatedFee] = useState<string>(FALLBACK_FEE);
  // Simulation result fetched from /api/simulate before the signing step is
  // presented. `null` means no simulation has run for the current form values;
  // `simulating` covers the in-flight fetch. (#478)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  // Set when the user tries to confirm a mainnet action shortly after a
  // network change; signing waits for explicit acknowledgement. (#480)
  const [mainnetWarning, setMainnetWarning] = useState(false);

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

  const handleSubmit = async () => {
    if (!canProceed) return;
    setTxError(null);
    setSimulation(null);
    setSimulating(true);
    // Fetch a fresh fee estimate in the background; if it fails the
    // fallback value already set in state is shown instead. (#257)
    getEstimatedFeeXLM(network).then((fee) => setEstimatedFee(fee)).catch(() => {
      // getEstimatedFeeXLM never throws (it falls back internally), but
      // guard here for defence in depth.
      setEstimatedFee(FALLBACK_FEE);
    });
    // Simulate before presenting the signing step: the review screen shows
    // the predicted fee, net amount, recipient, and any specific failure
    // reason instead of asking the user to sign blind. The endpoint always
    // resolves; if it can't run (offline / unreachable), the review screen
    // degrades to the static fee estimate and lets the user continue. (#478)
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAddress: fromAddress,
          destinationAddress: toAddress,
          amount,
          assetCode: asset,
          network,
        }),
      });
      if (response.ok) {
        setSimulation((await response.json()) as SimulationResult);
      } else {
        setSimulation({
          ok: false,
          reason: "simulation_unavailable",
          message: "The transaction couldn't be simulated right now. Review the details and try again.",
        });
      }
    } catch {
      setSimulation({
        ok: false,
        reason: "simulation_unavailable",
        message: "The transaction couldn't be simulated right now. Review the details and try again.",
      });
    } finally {
      setSimulating(false);
      setStep("review");
    }
  };

  /** The signing + submission step, shared by the confirm button and the
   *  mainnet warning's "I understand" action. (#480) */
  const performConfirm = async () => {
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
      // Record the outcome in the notification centre so the result survives
      // navigation away from the review/confirm screen. (#477)
      addNotification({
        kind: "transaction",
        title: "Transaction submitted",
        message: `${amount} ${asset} to ${toAddress.slice(0, 8)}…${toAddress.slice(-6)}`,
        href: getExplorerUrl(network, "tx", result.hash),
      });
    } catch (e: unknown) {
      const message = toSafeErrorMessage(e, "Transaction failed. Please try again.");
      setTxError(message);
      setTxStatus("error");
      addNotification({
        kind: "failure",
        title: "Transaction failed",
        message: `${message.slice(0, 120)}${message.length > 120 ? "…" : ""}`,
        href: "/bridge",
      });
    }
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
    // Warn before a mainnet action initiated shortly after a network change:
    // real funds are at stake and the switch may have been a mistake. (#480)
    if (shouldWarnOnMainnetAction(network, recentlyChangedNetwork, mainnetWarning)) {
      setMainnetWarning(true);
      return;
    }
    await performConfirm();
  };

  const handleReset = () => {
    setStep("form");
    setTxStatus("idle");
    setTxHash(null);
    setTxError(null);
    // Form values may change, so a stale prediction must not carry over.
    setSimulation(null);
    setMainnetWarning(false);
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">G → C Bridge</h1>
        <p className="text-[var(--text-muted)]">
          Fund a Soroban smart account (C-address) from an existing Stellar G-address.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="card p-6">
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
                          className="w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono text-[var(--text-muted)] cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
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
                        className="w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
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
                        className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
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
                      onChange={(e) => setAsset(e.target.value)}
                      aria-label="Asset to send"
                      className="px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
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
                    <span className="text-sm">
                      {simulation?.ok ? simulation.feeXlm : estimatedFee}
                    </span>
                  </div>
                </div>

                {mainnetWarning && network === "PUBLIC" && (
                  <div
                    role="alert"
                    className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3"
                  >
                    <AlertTriangle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[var(--error)]">Mainnet warning</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        You changed networks recently. This transaction will send real funds
                        on Mainnet and can&apos;t be undone. Make sure you intend to use real
                        assets before continuing.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setMainnetWarning(false);
                            void performConfirm();
                          }}
                          className="px-4 py-2 rounded-lg bg-[var(--error)] text-white text-xs font-medium hover:bg-[var(--error)]/90 transition-colors"
                        >
                          I understand — continue on Mainnet
                        </button>
                        <button
                          type="button"
                          onClick={() => setMainnetWarning(false)}
                          className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Predicted outcome from the simulation endpoint (#478). */}
                {simulating ? (
                  <div className="flex items-center gap-2 p-4 rounded-lg bg-[var(--surface-2)]">
                    <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
                    <span className="text-sm text-[var(--text-muted)]">Simulating transaction…</span>
                  </div>
                ) : simulation?.ok ? (
                  <div className="p-4 rounded-lg border border-[var(--success)]/20 bg-[var(--success)]/5">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[var(--text-muted)]">Net amount received</span>
                        <span className="text-sm font-semibold">
                          {simulation.netAmount} {simulation.asset}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[var(--text-muted)]">Recipient</span>
                        <span className="text-sm font-mono">{simulation.recipient}</span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        This is a prediction based on current network state — it can change
                        before the transaction is submitted.
                      </p>
                    </div>
                  </div>
                ) : simulation && !simulation.ok ? (
                  <div
                    role="alert"
                    className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[var(--error)]">
                        Simulation predicts failure
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">{simulation.message}</p>
                    </div>
                  </div>
                ) : null}

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
                    disabled={
                      txStatus === "signing" ||
                      txStatus === "submitting" ||
                      !isOnline ||
                      (simulation !== null && !simulation.ok)
                    }
                    title={
                      simulation !== null && !simulation.ok
                        ? "Fix the issue shown by the simulation before signing"
                        : undefined
                    }
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
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
  );
}
