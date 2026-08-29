"use client";

import { useEffect, useState } from "react";
import { Wallet, Copy, Check, X, Save, Trash2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useWallet } from "@/components/wallet-provider";
import AvatarUpload from "@/components/avatar-upload";
import LiveRegion from "@/components/live-region";
import OnboardingModal from "@/components/OnboardingModal";
import {
  GUIDED_STEPS,
  ONBOARDING_STORAGE_KEY,
} from "@/components/onboarding-flow";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { formatNetworkLabel } from "@/lib/stellar";
import {
  DISPLAY_NAME_MAX_LENGTH,
  clearDisplayName,
  loadDisplayName,
  saveDisplayName,
  shortenAddress,
  validateDisplayName,
} from "@/lib/profile";

/**
 * Profile page (#325).
 *
 * Shows the connected wallet's identity — avatar, display name, address and
 * network — and lets the user edit the two pieces of it that are theirs to set.
 * Both are stored per address in `localStorage` and never leave the browser;
 * see `src/lib/profile.ts` and `src/lib/avatar.ts` for the storage contracts.
 *
 * Wallet-gated the same way as the dashboard: with no connection there is no
 * address to key profile data on, so the page offers a connect prompt instead of
 * an empty form.
 */
export default function ProfilePage() {
  const {
    isConnected,
    address,
    networkStatus,
    walletNetworkName,
    isNetworkSupported,
    connect,
    isConnecting,
  } = useWallet();
  const { status: copyStatus, copy: copyToClipboard } = useCopyToClipboard();

  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameNotice, setNameNotice] = useState("");
  // Controls the "reopen onboarding" modal (#472); the guide is reachable again
  // from the profile page even after it was completed or skipped.
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Read from storage after mount only: touching localStorage during render
  // would produce different server and client output and break hydration.
  // Re-runs on address change so switching wallets loads that wallet's name.
  useEffect(() => {
    const stored = loadDisplayName(address);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedName(stored);
    setName(stored ?? "");
    setNameError(null);
    setNameNotice("");
  }, [address]);

  const handleSaveName = (event: React.FormEvent) => {
    event.preventDefault();
    if (!address) return;

    const validation = validateDisplayName(name);
    if (!validation.ok) {
      setNameError(validation.error);
      setNameNotice("");
      return;
    }
    if (!saveDisplayName(address, validation.value)) {
      setNameError("Couldn't save your display name — browser storage may be full.");
      setNameNotice("");
      return;
    }
    setNameError(null);
    setSavedName(validation.value);
    // Show the normalised value, so trailing whitespace visibly disappears
    // rather than silently differing from what was stored.
    setName(validation.value);
    setNameNotice("Display name saved.");
  };

  const handleClearName = () => {
    clearDisplayName(address);
    setSavedName(null);
    setName("");
    setNameError(null);
    setNameNotice("Display name removed.");
  };

  const handleCopy = () => {
    if (!address) return;
    copyToClipboard(address);
  };

  // The copy button reports its result by swapping icons, which a screen reader
  // parked on the button never hears; the live region is the only feedback AT
  // users get that the address reached the clipboard.
  const copyAnnouncement =
    copyStatus === "copied"
      ? "Wallet address copied to clipboard."
      : copyStatus === "error"
        ? "Copy failed. Check clipboard permissions and try again."
        : "";

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-[var(--primary-light)]" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
          <p className="text-[var(--text-muted)] mb-6">
            Connect your Freighter wallet to view and edit your profile.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={isConnecting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wallet className="w-4 h-4" />
            {isConnecting ? "Connecting..." : "Connect Freighter"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Profile</h1>
        <p className="text-[var(--text-muted)]">
          Your avatar and display name are stored in this browser only — never uploaded.
        </p>
      </div>

      <section aria-labelledby="profile-identity" className="card p-6 mb-6">
        <h2 id="profile-identity" className="text-lg font-semibold mb-4">
          Identity
        </h2>

        <div className="mb-6">
          <AvatarUpload address={address ?? null} size={80} />
        </div>

        <form onSubmit={handleSaveName} noValidate>
          <label htmlFor="display-name" className="block text-sm font-medium mb-1.5">
            Display name
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <input
              id="display-name"
              name="display-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
                setNameNotice("");
              }}
              maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
              placeholder={shortenAddress(address) || "Your name"}
              aria-invalid={nameError ? true : undefined}
              aria-describedby="display-name-hint"
              className="flex-1 min-w-[12rem] px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
            >
              <Save className="w-4 h-4 shrink-0" />
              Save
            </button>
            {savedName && (
              <button
                type="button"
                onClick={handleClearName}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-transparent text-sm font-medium text-[var(--text-muted)] hover:text-[var(--error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-light)]"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                Remove
              </button>
            )}
          </div>
          <p id="display-name-hint" className="mt-1.5 text-xs text-[var(--text-muted)]">
            {nameError ? (
              <span role="alert" className="text-[var(--error)]">
                {nameError}
              </span>
            ) : (
              `Up to ${DISPLAY_NAME_MAX_LENGTH} characters. Shown only to you, in this browser.`
            )}
          </p>
          <LiveRegion message={nameNotice} />
        </form>
      </section>

      <section aria-labelledby="profile-wallet" className="card p-6 mb-6">
        <h2 id="profile-wallet" className="text-lg font-semibold mb-4">
          Wallet
        </h2>

        <dl className="space-y-4">
          <div>
            <dt className="text-xs text-[var(--text-muted)] mb-1">Connected address</dt>
            <dd className="flex items-center gap-2">
              <code className="text-sm font-mono break-all">{address}</code>
              <button
                type="button"
                onClick={handleCopy}
                // title alone is an unreliable accessible name (skipped by some
                // AT, unavailable on touch), so the button is named explicitly
                // and title is kept for the sighted tooltip.
                aria-label="Copy wallet address"
                title={
                  copyStatus === "error"
                    ? "Copy failed — check clipboard permissions"
                    : "Copy address"
                }
                className="shrink-0 p-1 rounded hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                {copyStatus === "copied" ? (
                  <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                ) : copyStatus === "error" ? (
                  <X className="w-3.5 h-3.5 text-[var(--error)]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
              </button>
              {copyStatus === "error" && (
                <span className="text-xs text-[var(--error)]">Copy failed</span>
              )}
              <LiveRegion message={copyAnnouncement} />
            </dd>
          </div>

          <div>
            <dt className="text-xs text-[var(--text-muted)] mb-1">Network</dt>
            <dd
              className={`text-sm ${
                isNetworkSupported ? "" : "text-[var(--error)] font-medium"
              }`}
            >
              {formatNetworkLabel(networkStatus, walletNetworkName)}
              {!isNetworkSupported && " — switch to Testnet or Mainnet to bridge"}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="profile-guide" className="card p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="profile-guide" className="text-lg font-semibold mb-1">
              Onboarding guide
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Revisit the walkthrough that explains C-addresses and picks a
              funding route. Progress is saved, so you resume where you left
              off.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            data-testid="reopen-onboarding"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Open guide
          </button>
        </div>
      </section>

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-sm font-medium hover:border-[var(--text-muted)] transition-colors"
      >
        Back to dashboard
      </Link>

      {/* Reopening uses the same persisted progress as the landing-page flow,
          so skipping mid-way resumes here instead of restarting. Finishing
          re-writes "completed" and keeps the landing page quiet. (#472) */}
      <OnboardingModal
        isOpen={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => setOnboardingOpen(false)}
        steps={GUIDED_STEPS}
        storageKey={ONBOARDING_STORAGE_KEY}
      />
    </div>
  );
}
