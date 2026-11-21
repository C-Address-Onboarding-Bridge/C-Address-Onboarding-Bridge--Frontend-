/**
 * Site-wide footer.
 *
 * Structure:
 * - Brand/summary column describing the C-Address Bridge protocol.
 * - "Protocol" column: internal links to the three funding routes
 *   (`/bridge`, `/onramp`, `/cex`) that also appear in the navbar.
 * - "Resources" column: external links (Soroban docs, GitHub, Stellar.org),
 *   all opened via `target="_blank"` with `rel="noopener noreferrer"`.
 * - A language switcher row so users can change locale without scrolling back
 *   to the navbar (#462).
 * - A bottom bar with a disclaimer and the protocol name.
 *
 * Purely presentational — no state beyond the locale switcher. Memoized since
 * it never changes across route navigations.
 */
import React, { memo } from "react";
import { Wallet, Globe } from "lucide-react";
import { PrefetchLink } from "./prefetch-link";
import { useLocale, SUPPORTED_LOCALES, type Locale } from "@/contexts/LocaleContext";
import { useTranslation } from "@/lib/i18n";

const GITHUB_REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ||
  "https://github.com/C-Address-Onboarding-Bridge/C-Address-Onboarding-Bridge--Frontend-";

const LOCALE_FULL_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
};

const Footer = () => {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  const protocolLinks = [
    { href: "/bridge", label: t("footer.bridge") },
    { href: "/onramp", label: t("footer.onramp") },
    { href: "/cex", label: t("footer.cex") },
  ];

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
                <Wallet className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg">C-Address Bridge</span>
            </div>
            <p className="text-sm text-[var(--text-muted)] max-w-md">
              {t("footer.description")}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">{t("footer.protocol")}</h3>
            <ul className="space-y-2">
              {protocolLinks.map((link) => (
                <li key={link.href}>
                  <PrefetchLink
                    href={link.href}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]"
                  >
                    {link.label}
                  </PrefetchLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">{t("footer.resources")}</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://developers.stellar.org/docs/build/smart-contracts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]"
                >
                  {t("footer.soroban_docs")}
                </a>
              </li>
              <li>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]"
                >
                  {t("footer.github")}
                </a>
              </li>
              <li>
                <a
                  href="https://stellar.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]"
                >
                  {t("footer.stellar")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Language switcher row (#462) */}
        <div className="mt-8 pt-6 border-t border-[var(--border)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              {t("footer.language")}
            </span>
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                aria-pressed={l === locale}
                lang={l}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  l === locale
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary-light)] font-medium"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--text-muted)]"
                }`}
              >
                {LOCALE_FULL_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[var(--text-muted)]">
            {t("footer.disclaimer")}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--text-muted)]">C-Address Bridge Protocol</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(Footer);
