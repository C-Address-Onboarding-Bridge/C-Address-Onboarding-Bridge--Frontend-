"use client";

import { useState } from "react";
import { Building2, Copy, Check, ExternalLink, Wallet, X, Clock, HelpCircle } from "lucide-react";
import { CEX_LIST, type CexConfig } from "@/lib/types";
import { isCAddress } from "@/lib/stellar";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useDebounce } from "@/hooks/useDebounce";
import LiveRegion from "@/components/live-region";
import { useHelp } from "@/contexts/HelpContext";
import { useTranslation } from "@/lib/i18n";

/**
 * CexPage — CEX withdrawal routing to C-addresses.
 *
 * Changes in this version:
 * - Validates the C-address input with isCAddress() (StrKey.isValidContract)
 *   and shows an inline error when the value is not a valid Soroban contract
 *   address. (#299)
 * - Bridge deposit address and memo are not yet wired up; the section is
 *   reframed as "Coming Soon" to avoid misleading users into expecting a
 *   real deposit address. (#299)
 * - Copy button uses the shared useCopyToClipboard hook — shows "Copy failed"
 *   in the error state instead of a success checkmark. (#300)
 * - All user-facing strings are routed through t() so the page follows the
 *   language switcher. (#734)
 */
export default function CexPage() {
  const { t } = useTranslation();
  const { openHelp } = useHelp();
  // Annotated with CexConfig rather than inferred: CEX_LIST is `as const`, so
  // the inferred type would be the literal type of Binance alone and selecting
  // any other exchange would not type-check. (#346)
  const [selectedCex, setSelectedCex] = useState<CexConfig>(CEX_LIST[0]);
  const [cAddress, setCAddress] = useState("");
  const { status: copyStatus, copy: copyToClipboard } = useCopyToClipboard();

  // Debounce address so validation only runs 200 ms after the user stops
  // typing — avoids re-validating on every keystroke while keeping the
  // displayed input value instant.
  const debouncedCAddress = useDebounce(cAddress, 200);

  // Validate once the user has typed something.
  const addressTouched = debouncedCAddress.length > 0;
  const addressValid = addressTouched && isCAddress(debouncedCAddress);
  const addressError =
    addressTouched && !addressValid ? t("cex.addressError") : null;

  // Direct property read — the previous useMemo on a single property access
  // added overhead without any memoization benefit.
  const withdrawalUrl = selectedCex.withdrawalUrl;

  // Copy feedback is icon-only (plus a visible "Copy failed" label), so the
  // outcome has to be announced for it to exist at all for AT users.
  const copyAnnouncement =
    copyStatus === "copied"
      ? t("cex.copiedAnnouncement")
      : copyStatus === "error"
        ? t("cex.copyFailedAnnouncement")
        : "";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t("cex.title")}</h1>
          <p className="text-[var(--text-muted)]">{t("cex.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openHelp}
          className="hidden sm:flex p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors"
          aria-label={t("cex.openHelp")}
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1 */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t("cex.step1Title")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CEX_LIST.map((cex) => (
                <button
                  key={cex.name}
                  onClick={() => setSelectedCex(cex)}
                  aria-pressed={selectedCex.name === cex.name}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    selectedCex.name === cex.name
                      ? "border-[var(--primary)] bg-[var(--primary)]/5"
                      : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--text-muted)]"
                  }`}
                >
                  <Building2 className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                  <div className="font-medium text-sm">{cex.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {t("cex.minWithdrawal", { amount: cex.minWithdrawal })}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — C-address input with validation */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">{t("cex.step2Title")}</h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t("cex.step2Hint")}
            </p>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={cAddress}
                onChange={(e) => setCAddress(e.target.value.trim())}
                placeholder="CABC...DEF"
                aria-label={t("cex.addressInputLabel")}
                aria-invalid={addressError !== null}
                aria-describedby={addressError ? "caddress-error" : undefined}
                className={`w-full pl-10 pr-4 py-3 rounded-lg bg-[var(--surface-2)] border text-sm font-mono focus:outline-none transition-colors ${
                  addressError
                    ? "border-red-400 focus:border-red-500"
                    : "border-[var(--border)] focus:border-[var(--primary)]"
                }`}
              />
            </div>
            {addressError && (
              <p
                id="caddress-error"
                role="alert"
                className="mt-2 text-xs text-red-500 flex items-center gap-1"
              >
                <X className="w-3 h-3 flex-shrink-0" />
                {addressError}
              </p>
            )}
            {/* The invalid case is announced via role="alert"; without a
                matching role here the *positive* result of typing a correct
                address is silent, so an AT user gets told when they are wrong
                but never when they are right. */}
            {addressValid && (
              <p role="status" className="mt-2 text-xs text-green-500 flex items-center gap-1">
                <Check className="w-3 h-3 flex-shrink-0" />
                {t("cex.addressValid")}
              </p>
            )}
          </div>

          {/* Step 3 — Withdrawal details */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">
              {t("cex.step3Title", { name: selectedCex.name })}
            </h2>

            {/* Mounted with the card, not with the copy row below (which comes
                and goes with addressValid) — a live region inserted at the same
                moment it gains text can go unannounced. */}
            <LiveRegion message={copyAnnouncement} />

            {/* Bridge deposit address — coming soon (#299) */}
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 mb-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium mb-1">{t("cex.bridgeComingSoon")}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {t("cex.bridgeComingSoonBody")}
                </p>
              </div>
            </div>

            {addressValid ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">
                    {t("cex.depositAddressLabel")}
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono truncate">
                      {cAddress}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(cAddress)}
                      className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
                      aria-label={t("cex.copyAddress")}
                    >
                      {copyStatus === "copied" ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {copyStatus === "error" && (
                    <p className="mt-1 text-xs text-red-500">{t("cex.copyFailed")}</p>
                  )}
                </div>

                <a
                  href={withdrawalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
                >
                  {t("cex.openExchange", { name: selectedCex.name })}
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{t("cex.enterAddressPrompt")}</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold mb-3">{t("cex.whyTitle")}</h2>
            <ul className="space-y-2 text-sm text-[var(--text-muted)]">
              <li>{t("cex.why1")}</li>
              <li>{t("cex.why2")}</li>
              <li>{t("cex.why3")}</li>
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="font-semibold mb-3">{t("cex.needHelpTitle")}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">{t("cex.needHelpBody")}</p>
            <button
              type="button"
              onClick={openHelp}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              {t("cex.openHelpCentre")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
