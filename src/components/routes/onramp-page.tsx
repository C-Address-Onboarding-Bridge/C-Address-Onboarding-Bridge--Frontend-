"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CreditCard, Wallet, ExternalLink, Check, DollarSign, AlertCircle, HelpCircle, RefreshCw, Trophy } from "lucide-react";
import LiveRegion from "@/components/live-region";
import { isValidStellarAddress, isCAddress } from "@/lib/stellar";
import {
  compareOnrampQuotes,
  quoteSpread,
  formatQuoteAge,
  formatQuoteFeeRate,
  type OnrampQuoteComparison,
} from "@/lib/onrampQuotes";
import type { OnrampProvider } from "@/lib/types";
import { useDebounce } from "@/hooks/useDebounce";
import {
  providers,
  getProviderFeeRate,
  calculateOnrampFeeAndReceive,
  isWithinProviderLimits,
  getProviderLimitsForCurrency,
  getUsdExchangeRate,
} from "@/lib/onrampProviders";
import { useHelp } from "@/contexts/HelpContext";

export { providers, getProviderFeeRate, calculateOnrampFeeAndReceive };

export function buildProviderUrl(p: typeof providers[number], cAddress: string, fiatAmount: string, fiatCurrency: string = "USD"): string {
  if (!isCAddress(cAddress)) {
    throw new Error("Invalid C-address (must start with C, 56 characters, valid checksum).");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(fiatAmount)) {
    throw new Error("Invalid amount format.");
  }
  if (!p.currencies.includes(fiatCurrency)) {
    throw new Error(`${p.name} does not support ${fiatCurrency}.`);
  }

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

const QUOTE_REFRESH_INTERVAL_MS = 30_000;

const ONRAMP_CADDRESS_UNAVAILABLE_MESSAGE =
  "Card purchases can't be delivered to a Soroban C-address yet: MoonPay and Transak only deliver classic Stellar (G-address) payments, and the on-chain transfer path from a G-address to a C-address hasn't shipped. Follow progress in issue #284.";

function QuoteComparisonPanel({
  fiatAmount,
  fiatCurrency,
  isValid,
  cAddress,
}: {
  fiatAmount: string;
  fiatCurrency: string;
  isValid: boolean;
  cAddress?: string;
}) {
  const [loadedComparisons, setLoadedComparisons] = useState<{ query: string; items: OnrampQuoteComparison[] } | null>(null);
  const [quotedAt, setQuotedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const requestIdRef = useRef(0);

  const amount = Number(fiatAmount) || 0;
  const query = `${amount}:${fiatCurrency}`;

  const refresh = useCallback(async () => {
    if (!isValid || amount <= 0) return;
    const requestId = ++requestIdRef.current;
    try {
      const params = new URLSearchParams({ amount: String(amount), currency: fiatCurrency });
      if (cAddress) params.set("cAddress", cAddress);
      const res = await fetch(`/api/onramp/quotes?${params.toString()}`);
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (requestId !== requestIdRef.current) return;
      const live = (data as { live?: Partial<Record<OnrampProvider, { sourceAmount: string; destinationAmount: string; fee: string }>> }).live ?? {};
      setLoadedComparisons({ query, items: compareOnrampQuotes(amount, fiatCurrency, { liveQuotes: live }) });
      setQuotedAt(Date.now());
    } catch {
      // Network failure: the local-estimate comparison set above stands.
    }
  }, [amount, fiatCurrency, isValid, query, cAddress]);

  useEffect(() => {
    if (!isValid || amount <= 0) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, isValid, amount]);

  useEffect(() => {
    if (!isValid || amount <= 0) return;
    const refreshTimer = setInterval(refresh, QUOTE_REFRESH_INTERVAL_MS);
    const tickTimer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    };
  }, [refresh, isValid, amount]);

  if (!isValid || amount <= 0) return null;

  const comparisons = loadedComparisons?.query === query
    ? loadedComparisons.items
    : compareOnrampQuotes(amount, fiatCurrency);
  const spread = quoteSpread(comparisons);

  return (
    <div className="card p-5" data-testid="quote-comparison-panel">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Compare Providers</h3>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh quotes"
          data-testid="quote-refresh-button"
          className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {comparisons.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No provider currently supports {fiatCurrency} for this comparison.
        </p>
      ) : (
        <>
          <ul className="space-y-2" data-testid="quote-comparison-list">
            {comparisons.map((q) => (
              <li
                key={q.provider}
                data-testid={`quote-row-${q.provider}`}
                className={`p-3 rounded-lg border ${
                  q.isBest ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)] bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    {q.isBest && <Trophy className="w-3.5 h-3.5 text-[var(--primary)]" aria-hidden="true" />}
                    {q.providerName}
                    {q.isBest && <span className="sr-only"> — best rate</span>}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {q.source === "live" ? "Live" : q.estimateAvailable ? "Estimated" : "Live quote needed"}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>Rate ({formatQuoteFeeRate(q.provider)} fee)</span>
                  <span className="tabular-nums">-{q.fee} {q.fiatCurrency}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold mt-1">
                  <span className="text-[var(--text-muted)] font-normal text-xs self-center">You receive</span>
                  <span className="tabular-nums">
                    {q.estimateAvailable ? `${q.destinationAmount} USDC` : "Live quote needed"}
                  </span>
                </div>
                {q.withinLimits === false && (
                  <p className="text-xs text-[var(--error)] mt-1" role="alert">
                    Outside {q.providerName}&apos;s advertised limits for this amount.
                  </p>
                )}
              </li>
            ))}
          </ul>

          {spread && (
            <p className="text-xs text-[var(--text-muted)] mt-3" data-testid="quote-spread">
              Best vs. worst: {spread.absolute.toFixed(2)} USDC ({spread.percent.toFixed(1)}%) apart.
            </p>
          )}
          {quotedAt && (
            <p className="text-xs text-[var(--text-muted)] mt-1" data-testid="quote-age">
              Quoted {formatQuoteAge(quotedAt)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function OnrampPage() {
  const { openHelp } = useHelp();
  const [cAddress, setCAddress] = useState("");
  const [fiatAmount, setFiatAmount] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("moonpay");
  const [fiatCurrency, setFiatCurrency] = useState("USD");
  const [step, setStep] = useState<"form" | "redirect">("form");
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const provider = providers.find((p) => p.id === selectedProvider);
  const handleProviderSelect = (id: string) => {
    setSelectedProvider(id);
    setError(null);
    const next = providers.find((p) => p.id === id);
    if (next && !next.currencies.includes(fiatCurrency)) {
      setFiatCurrency(next.currencies[0]);
    }
  };

  const debouncedCAddress = useDebounce(cAddress, 300);
  const debouncedFiatAmount = useDebounce(fiatAmount, 300);
  const validAddress = !debouncedCAddress || (isValidStellarAddress(debouncedCAddress) && isCAddress(debouncedCAddress));
  const validAmountFormat = !debouncedFiatAmount || /^\d+(\.\d{1,2})?$/.test(debouncedFiatAmount);

  const fxRate = getUsdExchangeRate(fiatCurrency);
  const convertedLimits = getProviderLimitsForCurrency(selectedProvider, fiatCurrency);
  const withinProviderLimits =
    !debouncedFiatAmount ||
    !validAmountFormat ||
    fxRate === null ||
    isWithinProviderLimits(Number(debouncedFiatAmount), selectedProvider, fiatCurrency);
  const validAmount = validAmountFormat && withinProviderLimits;
  const canProceed = cAddress && fiatAmount && validAddress && validAmount && debouncedCAddress === cAddress && debouncedFiatAmount === fiatAmount;

  const { fee: feeAmount, receive: receiveAmount, rateAvailable } = calculateOnrampFeeAndReceive(
    Number(fiatAmount) || 0,
    selectedProvider,
    fiatCurrency
  );

  const formattedProviderLimits = convertedLimits
    ? `${convertedLimits.min.toLocaleString("en-US")} - ${convertedLimits.max.toLocaleString("en-US")} ${fiatCurrency}`
    : provider?.limits ?? "";

  const handleProviderRedirect = () => {
    if (!canProceed) return;
    setError(null);

    if (!provider) return;

    if (!provider.apiKey) {
      setError(`${provider.name} API key is not configured. Set NEXT_PUBLIC_${provider.id === "moonpay" ? "MOONPAY" : "TRANSAK"}_API_KEY in your environment.`);
      return;
    }

    if (isCAddress(cAddress)) {
      setError(ONRAMP_CADDRESS_UNAVAILABLE_MESSAGE);
      return;
    }

    const redirectTab = window.open("", "_blank", "noopener,noreferrer");

    fetch("/api/onramp/redirect-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: provider.id,
        address: cAddress,
        fiatAmount,
        fiatCurrency,
      }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!response.ok || typeof body.url !== "string" || !body.url) {
          throw new Error(body.error || "Unable to prepare provider redirect. Please double-check your input and try again.");
        }
        setRedirectUrl(body.url);
        setStep("redirect");
        if (redirectTab) {
          redirectTab.location.href = body.url;
        } else {
          window.open(body.url, "_blank", "noopener,noreferrer");
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to build onramp redirect URL:", err);
        redirectTab?.close();
        setError(
          err instanceof Error
            ? err.message
            : "Unable to prepare provider redirect. Please double-check your input and try again."
        );
      });
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
            <LiveRegion
              message={
                step === "redirect"
                  ? `Opened a new tab to complete your purchase with ${provider?.name ?? "the provider"}.`
                  : ""
              }
            />
            {step === "form" && (
              <div className="space-y-6" data-testid="onramp-form">
                <div>
                  <label className="block text-sm font-medium mb-3">Select Provider</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        data-testid={`onramp-provider-${p.id}`}
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
                  {!validAmountFormat && debouncedFiatAmount && (
                    <p id="fiat-amount-error" className="text-xs text-[var(--error)] mt-1" role="alert">Invalid amount format</p>
                  )}
                  {validAmountFormat && !withinProviderLimits && debouncedFiatAmount && provider && (
                    <p id="fiat-amount-error" className="text-xs text-[var(--error)] mt-1" role="alert">
                      Enter an amount within {provider.name}&apos;s limits ({formattedProviderLimits}).
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                  <h4 className="text-sm font-medium mb-2">Estimated Output</h4>
                  <div className="flex justify-between items-baseline gap-3 text-sm">
                    <span className="shrink-0 text-[var(--text-muted)]">You pay</span>
                    <span className="min-w-0 text-right break-all tabular-nums">{fiatAmount || "0"} {fiatCurrency}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-3 text-sm mt-1">
                    <span className="shrink-0 text-[var(--text-muted)]">Fee ({provider?.fee})</span>
                    <span className="min-w-0 text-right break-all tabular-nums">
                      -{fiatAmount && validAmount ? `${feeAmount.toFixed(2)} ${fiatCurrency}` : "0"}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline gap-3 text-sm mt-1">
                    <span className="shrink-0 text-[var(--text-muted)]">Est. receive</span>
                    <span className="min-w-0 text-right break-all tabular-nums font-semibold">
                      {!fiatAmount || !validAmount
                        ? "—"
                        : rateAvailable && receiveAmount !== null
                          ? `~${receiveAmount.toFixed(2)} USDC`
                          : "Live quote needed"}
                    </span>
                  </div>
                </div>

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
                  A new tab has been opened to complete your purchase. Funds will be sent to your Stellar (G-address) account — delivery straight to a Soroban C-address isn&apos;t available yet (#934).
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
          <QuoteComparisonPanel
            fiatAmount={debouncedFiatAmount}
            fiatCurrency={fiatCurrency}
            isValid={validAmount && debouncedFiatAmount === fiatAmount}
            cAddress={
              debouncedCAddress &&
              debouncedCAddress === cAddress &&
              isValidStellarAddress(debouncedCAddress) &&
              isCAddress(debouncedCAddress)
                ? debouncedCAddress
                : undefined
            }
          />

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
            <button
              type="button"
              onClick={openHelp}
              className="inline-flex items-center gap-2 text-sm text-[var(--primary-light)] hover:underline"
            >
              <HelpCircle className="w-4 h-4" />
              Open help centre
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}