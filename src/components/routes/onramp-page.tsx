"use client";

import { useState } from "react";
import { CreditCard, Wallet, ExternalLink, ArrowRight, Check, DollarSign, AlertCircle } from "lucide-react";
import LiveRegion from "@/components/live-region";
import { isValidStellarAddress, isCAddress } from "@/lib/stellar";
import { useDebounce } from "@/hooks/useDebounce";

const MOONPAY_API_KEY = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
const TRANSAK_API_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY || "";

const providers = [
  {
    id: "moonpay",
    name: "Moonpay",
    description: "Buy with credit/debit card",
    fee: "4.5%",
    limits: "$20 - $10,000",
    currencies: ["USD", "EUR", "GBP"],
    supported: true,
    apiKey: MOONPAY_API_KEY,
    baseUrl: "https://buy.moonpay.com",
  },
  {
    id: "transak",
    name: "Transak",
    description: "Buy with card, Apple Pay, Google Pay",
    fee: "5%",
    limits: "$15 - $25,000",
    currencies: ["USD", "EUR", "GBP", "INR"],
    supported: true,
    apiKey: TRANSAK_API_KEY,
    baseUrl: "https://global.transak.com",
  },
];

export function getProviderFeeRate(providerId: string): number {
  return providerId === "moonpay" ? 0.045 : 0.05;
}

export function calculateOnrampFeeAndReceive(amount: number, providerId: string) {
  const feeRate = getProviderFeeRate(providerId);
  const fee = amount * feeRate;
  const receive = amount - fee;
  return { feeRate, fee, receive };
}

export function buildProviderUrl(p: typeof providers[number], cAddress: string, fiatAmount: string, fiatCurrency: string = "USD"): string {
  // Defence-in-depth: re-validate inputs independently of the button's
  // disabled state / canProceed guard. These checks match the same validation
  // logic used at the UI layer (isCAddress from @/lib/stellar and the same
  // fiat-amount regex used for validAmount). If a future refactor removes or
  // weakens the UI guard, this function will still refuse to build a URL with
  // an invalid C-address or amount.
  if (!isCAddress(cAddress)) {
    throw new Error("Invalid C-address (must start with C, 56 characters, valid checksum).");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(fiatAmount)) {
    throw new Error("Invalid amount format.");
  }
  if (!p.currencies.includes(fiatCurrency)) {
    throw new Error(`${p.name} does not support ${fiatCurrency}.`);
  }

  // Why URLSearchParams-based construction is safe from injection:
  //   1. Value encoding: URLSearchParams percent-encodes every param value
  //      (including &, =, #, ?, %, and all other non-unreserved characters),
  //      so an attacker-controlled value can never break out of the
  //      walletAddress= or amount= value slot and inject additional params.
  //   2. Fixed key set: all param names (apiKey, walletAddress, currencyCode,
  //      baseCurrencyAmount, baseCurrencyCode, network,
  //      defaultCryptoCurrency, defaultFiatAmount, fiatCurrency) are string
  //      literals in this file — user input is never used as a param key.
  //   3. Fixed base URL: p.baseUrl comes from the `providers` array above —
  //      hardcoded per-provider host literals — so the scheme + host are not
  //      attacker-controlled.
  // Combined with the isCAddress check above (which enforces a base32 alphabet
  // that excludes &, =, # outright), this provides two layers of defence.
  const params =
    p.id === "moonpay"
      ? new URLSearchParams({
          apiKey: p.apiKey,
          walletAddress: cAddress,
          currencyCode: "usdc_xlm",
          baseCurrencyAmount: fiatAmount,
          baseCurrencyCode: fiatCurrency.toLowerCase(),
        })
      : new URLSearchParams({
          apiKey: p.apiKey,
          walletAddress: cAddress,
          network: "stellar",
          defaultCryptoCurrency: "USDC",
          defaultFiatAmount: fiatAmount,
          fiatCurrency: fiatCurrency,
        });
  return `${p.baseUrl}?${params}`;
}

export default function OnrampPage() {
  const [cAddress, setCAddress] = useState("");
  const [fiatAmount, setFiatAmount] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("moonpay");
  const [fiatCurrency, setFiatCurrency] = useState("USD");
  const [step, setStep] = useState<"form" | "redirect">("form");
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const provider = providers.find((p) => p.id === selectedProvider);
  // Each provider supports its own currency set (see `providers` above); switching
  // provider while a currency the new provider doesn't support is selected would
  // otherwise silently build a redirect URL for a currency never shown to the user.
  const handleProviderSelect = (id: string) => {
    setSelectedProvider(id);
    setError(null);
    const next = providers.find((p) => p.id === id);
    if (next && !next.currencies.includes(fiatCurrency)) {
      setFiatCurrency(next.currencies[0]);
    }
  };
  // Debounce address and amount validation to avoid running expensive
  // StrKey checks on every keystroke — validation fires 300 ms after the
  // user stops typing instead of on every character change.
  const debouncedCAddress = useDebounce(cAddress, 300);
  const debouncedFiatAmount = useDebounce(fiatAmount, 300);
  const validAddress = !debouncedCAddress || (isValidStellarAddress(debouncedCAddress) && isCAddress(debouncedCAddress));
  const validAmount = !debouncedFiatAmount || /^\d+(\.\d{1,2})?$/.test(debouncedFiatAmount);
  const canProceed = cAddress && fiatAmount && validAddress && validAmount && debouncedCAddress === cAddress && debouncedFiatAmount === fiatAmount;

  const { fee: feeAmount, receive: receiveAmount } = calculateOnrampFeeAndReceive(
    Number(fiatAmount) || 0,
    selectedProvider
  );

  const handleProviderRedirect = () => {
    if (!canProceed) return;
    setError(null);

    if (!provider) return;

    if (!provider.apiKey) {
      setError(`${provider.name} API key is not configured. Set NEXT_PUBLIC_${provider.id === "moonpay" ? "MOONPAY" : "TRANSAK"}_API_KEY in your environment.`);
      return;
    }

    try {
      const url = buildProviderUrl(provider, cAddress, fiatAmount, fiatCurrency);
      setRedirectUrl(url);
      setStep("redirect");
      // Open synchronously within the click handler to preserve user activation
      // so default popup blockers do not block the new tab.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed to build onramp redirect URL:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to prepare provider redirect. Please double-check your input and try again."
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Fiat Onramp</h1>
        <p className="text-[var(--text-muted)]">
          Buy crypto with a credit card and send it directly to a Soroban C-address.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="card p-6">
            {/* Pressing Continue swaps the whole form for the redirect panel and
                opens a new tab. Focus stays where it was, so an AT user gets no
                signal that either happened — the region announces the outcome.
                Mounted outside the step branches so it is already registered
                when the step flips. */}
            <LiveRegion
              message={
                step === "redirect"
                  ? `Opened a new tab to complete your purchase with ${provider?.name ?? "the provider"}.`
                  : ""
              }
            />
            {step === "form" && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-3">Select Provider</label>
                  {/* Single column on phones: at ~320px two provider cards left the
                      name, description and fee/limit rows overlapping their own
                      borders. (#341) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProviderSelect(p.id)}
                        aria-pressed={selectedProvider === p.id}
                        className={`p-4 rounded-lg border text-left transition-all ${
                          selectedProvider === p.id
                            ? "border-[var(--primary)] bg-[var(--primary)]/5"
                            : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--text-muted)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-semibold truncate">{p.name}</span>
                          {selectedProvider === p.id && (
                            <Check className="w-4 h-4 shrink-0 text-[var(--primary)]" />
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-1">{p.description}</p>
                        {/* Wrap instead of overflowing: "$15 - $25,000" does not fit
                            beside the fee on a narrow card. */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span>Fee: {p.fee}</span>
                          <span aria-hidden="true">•</span>
                          <span>{p.limits}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="onramp-c-address" className="block text-sm font-medium mb-2">Destination C-Address</label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                       id="onramp-c-address"
                       type="text"
                       autoComplete="off"
                       value={cAddress}
                       onChange={(e) => setCAddress(e.target.value)}
                       placeholder="CABC...DEF"
                       aria-invalid={!validAddress && !!cAddress}
                       aria-describedby={!validAddress && cAddress ? "c-address-error" : undefined}
                       className="w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-[var(--primary)] transition-colors"
                     />
                   </div>
                   {!validAddress && debouncedCAddress && (
                     <p id="c-address-error" className="text-xs text-[var(--error)] mt-1" role="alert">Invalid C-address (must start with C, 56 characters)</p>
                   )}
                </div>

                <div>
                  <label htmlFor="onramp-fiat-amount" className="block text-sm font-medium mb-2">Amount</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                      <input
                         id="onramp-fiat-amount"
                         type="text"
                         value={fiatAmount}
                         onChange={(e) => setFiatAmount(e.target.value)}
                         placeholder="100.00"
                         aria-invalid={!validAmount && !!fiatAmount}
                         aria-describedby={!validAmount && fiatAmount ? "fiat-amount-error" : undefined}
                         className="w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
                       />
                     </div>
                     <select
                       id="onramp-fiat-currency"
                       value={fiatCurrency}
                       onChange={(e) => setFiatCurrency(e.target.value)}
                       aria-label="Currency"
                       className="px-3 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
                     >
                       {(provider?.currencies ?? []).map((c) => (
                         <option key={c} value={c}>{c}</option>
                       ))}
                     </select>
                   </div>
                   {!validAmount && debouncedFiatAmount && (
                     <p id="fiat-amount-error" className="text-xs text-[var(--error)] mt-1" role="alert">Invalid amount format</p>
                   )}
                </div>

                {/* Every row is label + value with the label pinned and the value
                    allowed to shrink/wrap. Previously a long amount (the field is
                    free text) grew the row past the card edge because flex items
                    do not shrink below their content width by default. (#341) */}
                <div className="p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                  <h4 className="text-sm font-medium mb-2">Estimated Output</h4>
                  <div className="flex justify-between items-baseline gap-3 text-sm">
                    <span className="shrink-0 text-[var(--text-muted)]">You pay</span>
                    <span className="min-w-0 text-right break-all tabular-nums">${fiatAmount || "0"} {fiatCurrency}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-3 text-sm mt-1">
                    <span className="shrink-0 text-[var(--text-muted)]">Fee ({provider?.fee})</span>
                    <span className="min-w-0 text-right break-all tabular-nums">
                      -${fiatAmount && validAmount ? feeAmount.toFixed(2) : "0"}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline gap-3 text-sm mt-1">
                    <span className="shrink-0 text-[var(--text-muted)]">Est. receive</span>
                    <span className="min-w-0 text-right break-all tabular-nums font-semibold">
                      {fiatAmount && validAmount
                        ? `~${receiveAmount.toFixed(2)} USDC`
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Raised by the Continue click (missing API key, or a failure
                    while building the redirect URL) and rendered below the
                    button the user just pressed, so nothing about it is
                    self-evident to AT: role="alert" is what makes the failure
                    reach the user who cannot see it. */}
                {error && (
                  <div
                    role="alert"
                    className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[var(--error)]">{error}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleProviderRedirect}
                  disabled={!canProceed}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span className="truncate">Continue with {provider?.name}</span>
                </button>
              </div>
            )}

            {step === "redirect" && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
                  <ExternalLink className="w-8 h-8 text-[var(--primary-light)]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Redirecting to {provider?.name}</h3>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  A new tab has been opened to complete your purchase. Funds will be sent to your C-address.
                </p>
                {redirectUrl && (
                  <a
                    href={redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 text-sm text-[var(--primary-light)] hover:underline mb-4"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0 mt-1" />
                    <span>Checkout didn&apos;t open? Continue to {provider?.name}</span>
                  </a>
                )}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => { setStep("form"); setRedirectUrl(null); }}
                    className="text-sm text-[var(--primary-light)] hover:underline"
                  >
                    Go back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold mb-3">Supported Providers</h3>
            <div className="space-y-3">
              {providers.map((p) => (
                <div key={p.id} className="p-3 rounded-lg bg-[var(--surface-2)]">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{p.name}</span>
                    {selectedProvider === p.id && <Check className="w-4 h-4 shrink-0 text-[var(--primary)]" />}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{p.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold mb-3">How It Works</h3>
            <ol className="space-y-3 text-sm text-[var(--text-muted)]">
              <li className="flex gap-2">
                <span className="text-[var(--primary-light)] font-medium">1.</span>
                <span>Choose your preferred fiat provider</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--primary-light)] font-medium">2.</span>
                <span>Enter your Soroban C-address</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--primary-light)] font-medium">3.</span>
                <span>Complete checkout and receive USDC</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--primary-light)] font-medium">4.</span>
                <span>Funds land directly in your smart account</span>
              </li>
            </ol>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold mb-3">Need Help?</h3>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              Make sure your C-address is valid before continuing.
            </p>
            <a
              href="https://developers.stellar.org/docs/build/smart-contracts"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[var(--primary-light)] hover:underline"
            >
              Learn about Soroban addresses
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}