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
import { Wallet, ArrowLeftRight, CreditCard, Building2, LayoutDashboard, UserRound, Menu, X, AlertTriangle, LogOut, ChevronDown, Loader2 } from "lucide-react";
import { useWallet } from "./wallet-provider";
import { PrefetchLink } from "./prefetch-link";
import NotificationCentre from "./notification-centre";
import { formatNetworkLabel } from "@/lib/stellar";
import { APP_NETWORK, type StellarNetwork, type WalletNetworkState } from "@/lib/types";

const navLinks = [
  { href: "/bridge", label: "Bridge", icon: ArrowLeftRight },
  { href: "/onramp", label: "Onramp", icon: CreditCard },
  { href: "/cex", label: "CEX", icon: Building2 },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: UserRound },
];

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

  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

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
            {/* Persistent network indicator + switcher (#480). */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNetworkMenuOpen((v) => !v)}
                aria-expanded={networkMenuOpen}
                aria-haspopup="menu"
                aria-label={`Network: ${switcherBadge.label}. Change network`}
                title={`Currently on ${switcherBadge.label}. Click to switch networks.`}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[0.6rem] font-semibold uppercase tracking-wide transition-colors hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${switcherBadge.className}`}
              >
                {switcherBadge.label}
                <ChevronDown
                  aria-hidden="true"
                  className={`w-3.5 h-3.5 transition-transform ${networkMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {networkMenuOpen && (
                <div
                  role="menu"
                  aria-label="Switch network"
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 overflow-hidden"
                >
                  <div className="px-4 py-2.5 border-b border-[var(--border)]">
                    <p className="text-xs font-medium">Switch network</p>
                    <p className="text-[0.6875rem] text-[var(--text-muted)]">
                      Requests the change through Freighter.
                    </p>
                  </div>
                  {(["TESTNET", "PUBLIC"] as StellarNetwork[]).map((target) => {
                    const isCurrent = isNetworkSupported && networkStatus === target;
                    return (
                      <button
                        key={target}
                        type="button"
                        role="menuitem"
                        onClick={() => handleSwitchNetwork(target)}
                        disabled={switchingTo !== null || isCurrent}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40"
                      >
                        <span>{target === "PUBLIC" ? "Mainnet" : "Testnet"}</span>
                        {switchingTo === target ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
                        ) : isCurrent ? (
                          <span className="text-xs text-[var(--success)]">Current</span>
                        ) : null}
                      </button>
                    );
                  })}
                  {switchHint && (
                    <p
                      role="status"
                      className="px-4 py-2.5 border-t border-[var(--border)] text-xs text-[var(--text-muted)]"
                    >
                      {switchHint}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Notification centre for transaction and account events (#477). */}
            <NotificationCentre />

            {isConnected ? (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                <span className="text-xs font-mono text-[var(--text-muted)]">{addressDisplay}</span>
                <NetworkBadge {...networkBadge} />
                <button
                  onClick={handleDisconnect}
                  aria-label="Disconnect wallet"
                  title="Disconnect wallet"
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
                {isConnecting ? "Connecting..." : "Connect Wallet"}
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
            <div className="pt-2 mt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between px-3 py-1">
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
                  Disconnect Wallet
                </button>
              </div>
            ) : (
              <button
                onClick={handleMobileConnect}
                disabled={isConnecting}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default memo(Navbar);

