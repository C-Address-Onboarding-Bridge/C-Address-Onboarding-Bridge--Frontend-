"use client";

/**
 * Keyboard Navigation & Accessibility (A11Y) Behavior for Mobile Menu:
 * - When mobile menu opens (mobileOpen = true), focus programmatically moves to the first interactive nav link inside the menu.
 * - Pressing 'Escape' key while menu is open closes the mobile menu.
 * - When mobile menu closes, focus is programmatically restored to the toggle button.
 * - Toggle button features proper ARIA attributes (`aria-expanded`, `aria-controls`, `aria-label`).
 * - Mobile menu container includes `id="mobile-menu"`, `role="region"`, and `aria-label="Mobile Navigation"`.
 */

import React, { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wallet,
  ArrowLeftRight,
  CreditCard,
  Building2,
  LayoutDashboard,
  UserRound,
  BookUser,
  Menu,
  X,
  AlertTriangle,
  LogOut,
  Sun,
  Moon,
  HelpCircle,
  Globe,
} from "lucide-react";
import { useWallet } from "./wallet-provider";
import { PrefetchLink } from "./prefetch-link";
import NotificationCentre from "./notification-centre";
import { formatNetworkLabel } from "@/lib/stellar";
import { useHelp } from "@/contexts/HelpContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocale, SUPPORTED_LOCALES, type Locale } from "@/contexts/LocaleContext";
import { APP_NETWORK, type StellarNetwork, type WalletNetworkState } from "@/lib/types";

const navLinks = [
  { href: "/bridge", label: "Bridge", icon: ArrowLeftRight },
  { href: "/onramp", label: "Onramp", icon: CreditCard },
  { href: "/cex", label: "CEX", icon: Building2 },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/address-book", label: "Address Book", icon: BookUser },
  { href: "/profile", label: "Profile", icon: UserRound },
];

/** Human-readable labels for each locale. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  es: "ES",
  fr: "FR",
  pt: "PT",
};

const LOCALE_FULL_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
};

interface NetworkBadgeProps {
  label: string;
  className: string;
  title: string;
}

// Shared by the desktop and mobile wallet-status displays so the badge
// markup only needs to be kept in sync with `networkBadge` in one place.
const NetworkBadge = ({ label, className, title }: NetworkBadgeProps) => (
  <span
    className={`text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${className}`}
    title={title}
  >
    {label}
  </span>
);

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------

const ThemeToggle = memo(function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Language Switcher (desktop dropdown)
// ---------------------------------------------------------------------------

const LanguageSwitcher = memo(function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative hidden sm:block">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${LOCALE_FULL_LABELS[locale]}`}
        title="Change language"
        className="flex items-center gap-1 p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <Globe className="w-4 h-4" />
        <span className="text-xs font-medium">{LOCALE_LABELS[locale]}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg z-50 py-1"
        >
          {SUPPORTED_LOCALES.map((l) => (
            <button
              key={l}
              role="option"
              aria-selected={l === locale}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)] ${
                l === locale
                  ? "text-[var(--primary-light)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span>{LOCALE_FULL_LABELS[l]}</span>
              {l === locale && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

const Navbar = () => {
  const pathname = usePathname();
  const {
    isConnected,
    address,
    network,
    networkStatus,
    walletNetworkName,
    isNetworkSupported,
    connect,
    disconnect,
    isConnecting,
    networkMismatch,
    dismissNetworkMismatch,
    switchNetwork,
  } = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Network switcher state (#480): a persistent indicator (always visible,
  // visually distinct for non-mainnet) plus a menu that requests the change
  // through the wallet.
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<StellarNetwork | null>(null);
  const [switchHint, setSwitchHint] = useState<string | null>(null);
  // Mobile language dropdown
  const [mobileLangOpen, setMobileLangOpen] = useState(false);

  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  const { openHelp } = useHelp();
  const { locale, setLocale, t } = useLocale();

  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const handleConnect = useCallback(() => connect(), [connect]);
  const handleMobileConnect = useCallback(() => {
    connect();
    setMobileOpen(false);
  }, [connect]);
  const handleDisconnect = useCallback(() => disconnect(), [disconnect]);
  const handleMobileDisconnect = useCallback(() => {
    disconnect();
    setMobileOpen(false);
  }, [disconnect]);

  // Keyboard navigation: Handle Escape key to close mobile menu
  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  // Escape also closes the network switcher menu.
  useEffect(() => {
    if (!networkMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNetworkMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [networkMenuOpen]);

  // Focus management: Move focus into menu on open, return focus to toggle on close
  useEffect(() => {
    if (mobileOpen) {
      const timer = requestAnimationFrame(() => {
        const firstFocusable = mobileMenuRef.current?.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      });
      wasOpenRef.current = true;
      return () => cancelAnimationFrame(timer);
    } else if (wasOpenRef.current) {
      toggleButtonRef.current?.focus();
      wasOpenRef.current = false;
    }
  }, [mobileOpen]);

  const addressDisplay = useMemo(() => (address ? `${address.slice(0, 4)}...${address.slice(-4)}` : null), [address]);

  // The indicator reports the wallet's actual network — or the app's target
  // network before a wallet is connected / while its network is unreadable —
  // so users always know which chain they are on. It is persistent (rendered
  // connected or not) and visually distinct for non-mainnet networks. (#480)
  // `networkStatus ?? APP_NETWORK` guards the partial mocks used in tests.
  const displayNetworkStatus: WalletNetworkState = networkStatus ?? APP_NETWORK;
  const switcherBadge = useMemo(() => {
    const label = formatNetworkLabel(displayNetworkStatus, walletNetworkName);
    if (displayNetworkStatus === "PUBLIC") {
      return { label, className: "bg-[var(--success)]/15 text-[var(--success)]" };
    }
    if (displayNetworkStatus === "TESTNET") {
      return { label, className: "bg-yellow-500/15 text-yellow-400" };
    }
    if (displayNetworkStatus === "UNSUPPORTED") {
      return { label, className: "bg-[var(--error)]/15 text-[var(--error)]" };
    }
    return { label, className: "bg-[var(--surface-2)] text-[var(--text-muted)]" };
  }, [displayNetworkStatus, walletNetworkName]);

  const handleSwitchNetwork = useCallback(
    async (target: StellarNetwork) => {
      if (typeof switchNetwork !== "function") return;
      setSwitchingTo(target);
      setSwitchHint(null);
      const result = await switchNetwork(target);
      setSwitchingTo(null);
      if (result === "switched") {
        setNetworkMenuOpen(false);
      } else if (result === "manual") {
        setSwitchHint("Change the network in Freighter — this app will update automatically.");
      } else {
        setSwitchHint("The network change was cancelled in the wallet.");
      }
    },
    [switchNetwork]
  );

  // The badge reports what the wallet is actually on, including networks the
  // app can't use. Rendering an unsupported network as "Testnet" is what made
  // #289 invisible to users. (#289)
  const networkBadge = useMemo(() => {
    const label = formatNetworkLabel(networkStatus, walletNetworkName);
    if (networkStatus === "PUBLIC") {
      return { label, className: "bg-[var(--success)]/15 text-[var(--success)]", title: "Connected to Mainnet" };
    }
    if (networkStatus === "TESTNET") {
      return { label, className: "bg-yellow-500/15 text-yellow-400", title: "Connected to Testnet" };
    }
    return {
      label,
      className: "bg-[var(--error)]/15 text-[var(--error)]",
      title:
        networkStatus === "UNSUPPORTED"
          ? `Freighter is on ${label}, which this app does not support`
          : "Freighter's network could not be read",
    };
  }, [networkStatus, walletNetworkName]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg">C-Address Bridge</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <PrefetchLink
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--primary)]/10 text-[var(--primary-light)]"
                      : "text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </PrefetchLink>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {/* Persistent network indicator + switcher (#480) */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setNetworkMenuOpen((v) => !v)}
                aria-label={`Network: ${switcherBadge.label}. Change network`}
                aria-haspopup="menu"
                aria-expanded={networkMenuOpen}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[0.6rem] font-semibold uppercase tracking-wide transition-colors ${switcherBadge.className}`}
              >
                {switcherBadge.label}
              </button>
              {networkMenuOpen && (
                <div
                  role="menu"
                  aria-label="Switch network"
                  className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg z-50 py-1"
                >
                  {(["TESTNET", "PUBLIC"] as StellarNetwork[]).map((target) => {
                    const isCurrent = isNetworkSupported && networkStatus === target;
                    return (
                      <button
                        key={target}
                        role="menuitem"
                        onClick={() => handleSwitchNetwork(target)}
                        disabled={switchingTo !== null || isCurrent}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                      >
                        <span>{target === "PUBLIC" ? "Mainnet" : "Testnet"}</span>
                        {isCurrent && <span className="text-xs text-[var(--success)]">Current</span>}
                      </button>
                    );
                  })}
                  {switchHint && (
                    <p role="status" className="px-3 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
                      {switchHint}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Help */}
            <button
              onClick={openHelp}
              aria-label={t("common.help")}
              title={t("common.help")}
              className="hidden sm:flex p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Language switcher (desktop) */}
            <LanguageSwitcher />

            {/* Theme toggle */}
            <ThemeToggle />

            {isConnected ? (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                <span className="text-xs font-mono text-[var(--text-muted)]">{addressDisplay}</span>
                <NetworkBadge {...networkBadge} />
                <button
                  onClick={handleDisconnect}
                  aria-label={t("common.disconnect")}
                  title={t("common.disconnect")}
                  className="ml-1 p-1 rounded text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting ? t("common.loading") : t("common.connect_wallet")}
              </button>
            )}

            <button
              ref={toggleButtonRef}
              onClick={toggleMobile}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="md:hidden p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)]"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {isConnected && !isNetworkSupported && (
        <div
          role="alert"
          aria-live="assertive"
          className="border-t border-[var(--error)]/30 bg-[var(--error)]/10 px-4 py-2"
        >
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-[var(--error)] text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              {networkStatus === "UNSUPPORTED" ? (
                <>
                  <strong>Unsupported network</strong> — Freighter is on{" "}
                  <span className="font-mono font-semibold">
                    {formatNetworkLabel(networkStatus, walletNetworkName)}
                  </span>
                  . Switch to Testnet or Mainnet to use the bridge.
                </>
              ) : (
                <>
                  <strong>Network unavailable</strong> — Freighter&apos;s network couldn&apos;t be
                  read. Unlock the extension and reload before bridging.
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {networkMismatch && (
        <div
          role="alert"
          aria-live="assertive"
          className="border-t border-yellow-500/30 bg-yellow-500/10 px-4 py-2"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-yellow-400 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>Network changed</strong> — Freighter is now on{" "}
                <span className="font-mono font-semibold">
                  {network === "PUBLIC" ? "Mainnet" : "Testnet"}
                </span>
                . Review any in-progress forms before continuing.
              </span>
            </div>
            <button
              onClick={dismissNetworkMismatch}
              aria-label="Dismiss network change warning"
              className="flex-shrink-0 text-yellow-400/70 hover:text-yellow-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {mobileOpen && (
        <div
          ref={mobileMenuRef}
          id="mobile-menu"
          role="region"
          aria-label="Mobile Navigation"
          className="md:hidden border-t border-[var(--border)] bg-[var(--background)]"
        >
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <PrefetchLink
                  key={link.href}
                  href={link.href}
                  onClick={closeMobile}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--primary)]/10 text-[var(--primary-light)]"
                      : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </PrefetchLink>
              );
            })}

            {/* Language switcher (mobile) */}
            <div className="pt-2 mt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Language
                </span>
                <button
                  onClick={() => setMobileLangOpen((v) => !v)}
                  aria-expanded={mobileLangOpen}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  {LOCALE_FULL_LABELS[locale]}
                </button>
              </div>
              {mobileLangOpen && (
                <div className="flex flex-wrap gap-1 px-3 pt-1 pb-2">
                  {SUPPORTED_LOCALES.map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        setLocale(l);
                        setMobileLangOpen(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        l === locale
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary-light)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      {LOCALE_FULL_LABELS[l]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 mt-2 border-t border-[var(--border)]">
              <div className="flex items-center gap-2 px-3 py-1">
                <span className="text-xs text-[var(--text-muted)]">Network</span>
                <span
                  className={`text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${switcherBadge.className}`}
                >
                  {switcherBadge.label}
                </span>
              </div>
              <div className="flex gap-2 px-3 pt-1">
                {(["TESTNET", "PUBLIC"] as StellarNetwork[]).map((target) => {
                  const isCurrent = isNetworkSupported && networkStatus === target;
                  return (
                    <button
                      key={target}
                      type="button"
                      onClick={() => handleSwitchNetwork(target)}
                      disabled={switchingTo !== null || isCurrent}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40"
                    >
                      {target === "PUBLIC" ? "Mainnet" : "Testnet"}
                    </button>
                  );
                })}
              </div>
              {switchHint && (
                <p role="status" className="px-3 pt-2 text-xs text-[var(--text-muted)]">
                  {switchHint}
                </p>
              )}
            </div>
            {isConnected ? (
              <div className="pt-2 mt-2 border-t border-[var(--border)] space-y-2">
                <div className="flex items-center gap-2 px-3">
                  <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                  <span className="text-xs font-mono text-[var(--text-muted)]">{addressDisplay}</span>
                  <NetworkBadge {...networkBadge} />
                </div>
                <button
                  onClick={handleMobileDisconnect}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                >
                  <LogOut className="w-4 h-4" />
                  {t("common.disconnect")}
                </button>
              </div>
            ) : (
              <button
                onClick={handleMobileConnect}
                disabled={isConnecting}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting ? t("common.loading") : t("common.connect_wallet")}
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default memo(Navbar);
