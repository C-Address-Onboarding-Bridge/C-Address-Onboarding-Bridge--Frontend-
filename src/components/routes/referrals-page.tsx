"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Coins, Copy, Loader2, Share2, TrendingUp, Users, X } from "lucide-react";
import QRCode from "qrcode";
import { useWallet } from "@/components/wallet-provider";
import LiveRegion from "@/components/live-region";
import { BarChart } from "@/components/bar-chart";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { getReferralStats } from "@/lib/api";
import {
  buildReferralLink,
  formatReferralAmount,
  formatReferralDateLabel,
  hasReferralActivity,
  type ReferralStats,
} from "@/lib/referrals";

/**
 * Referral dashboard (#469): the user's shareable referral link and QR code,
 * their referred volume/transaction count/accrued fees, and a time-series
 * chart of referred volume.
 *
 * Wallet-gated the same way as Dashboard/Profile — referral data is keyed on
 * the connected address. Unlike the dashboard's Fee Tier card, a fetch
 * failure here shows a retry rather than silently hiding: this page exists
 * entirely to show the referral link, so there's nothing meaningful to
 * render without it (see the doc comment on `getReferralStats`).
 */
export default function ReferralsPage() {
  const { isConnected, address, network, isNetworkSupported, connect, isConnecting } = useWallet();
  const { status: copyStatus, copy: copyToClipboard } = useCopyToClipboard();

  const [statsResult, setStatsResult] = useState<{ key: string; stats: ReferralStats | null; error: boolean } | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [qrResult, setQrResult] = useState<{ link: string; svg: string | null; error: boolean } | null>(null);
  const requestKey = `${address ?? ""}:${network}:${refreshIndex}`;
  const requestEnabled = Boolean(isConnected && address && isNetworkSupported);
  const currentStats = statsResult?.key === requestKey ? statsResult : null;
  const stats = currentStats?.stats ?? null;
  const loading = requestEnabled && currentStats === null;
  const loadError = currentStats?.error ?? false;

  useEffect(() => {
    if (!isConnected || !address) return;
    // Same rule as the dashboard (#289): don't query referral stats for a
    // network the app can't confidently identify.
    if (!isNetworkSupported) return;
    let cancelled = false;

    getReferralStats(address, network).then((result) => {
      if (cancelled) return;
      setStatsResult({ key: requestKey, stats: result, error: !result });
    });

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, network, isNetworkSupported, refreshIndex, requestKey]);

  const referralLink = useMemo(() => {
    if (!stats) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildReferralLink(stats.referralCode, origin);
  }, [stats]);

  const currentQr = qrResult?.link === referralLink ? qrResult : null;
  const qrSvg = currentQr?.svg ?? null;
  const qrError = currentQr?.error ?? false;

  useEffect(() => {
    if (!referralLink) return;
    let cancelled = false;

    // `type: "svg"` renders a plain markup string with no canvas/DOM
    // dependency, unlike toDataURL/toCanvas — this keeps QR generation
    // working identically in the browser and in tests.
    QRCode.toString(referralLink, { type: "svg", margin: 1, width: 176 })
      .then((svg) => {
        if (!cancelled) setQrResult({ link: referralLink, svg, error: false });
      })
      .catch(() => {
        if (!cancelled) setQrResult({ link: referralLink, svg: null, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [referralLink]);

  const handleCopy = () => {
    if (!referralLink) return;
    copyToClipboard(referralLink);
  };

  const copyAnnouncement =
    copyStatus === "copied"
      ? "Referral link copied to clipboard."
      : copyStatus === "error"
        ? "Copy failed. Check clipboard permissions and try again."
        : "";

  const volumeBuckets = useMemo(
    () =>
      (stats?.volumeOverTime ?? []).map((point) => ({
        date: point.date,
        label: formatReferralDateLabel(point.date),
        volume: point.volume,
      })),
    [stats]
  );

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-8 h-8 text-[var(--primary-light)]" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
          <p className="text-[var(--text-muted)] mb-6">
            Connect your Freighter wallet to view your referral link and stats.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={isConnecting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? "Connecting..." : "Connect Freighter"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Referrals</h1>
        <p className="text-[var(--text-muted)]">
          Share your referral link — funding attributed to it earns you referral fees.
        </p>
      </div>

      {!isNetworkSupported ? (
        <div role="alert" className="card p-8 text-center text-sm text-[var(--error)]">
          Freighter&apos;s network isn&apos;t supported here, so referral data can&apos;t be loaded. Switch to Testnet or
          Mainnet.
        </div>
      ) : loading ? (
        <div role="status" className="card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
          <span className="sr-only">Loading your referral information…</span>
        </div>
      ) : loadError || !stats ? (
        <div role="alert" className="card p-8 text-center" data-testid="referrals-load-error">
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Couldn&apos;t load your referral information. Please try again.
          </p>
          <button
            type="button"
            onClick={() => setRefreshIndex((n) => n + 1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <section aria-labelledby="referral-link-heading" className="card p-6 mb-6">
            <h2 id="referral-link-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[var(--primary-light)]" />
              Your referral link
            </h2>

            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 text-sm font-mono break-all px-3 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                    {referralLink}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="Copy referral link"
                    title={copyStatus === "error" ? "Copy failed — check clipboard permissions" : "Copy referral link"}
                    className="shrink-0 p-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    {copyStatus === "copied" ? (
                      <Check className="w-4 h-4 text-[var(--success)]" />
                    ) : copyStatus === "error" ? (
                      <X className="w-4 h-4 text-[var(--error)]" />
                    ) : (
                      <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                    )}
                  </button>
                  <LiveRegion message={copyAnnouncement} />
                </div>
                {copyStatus === "error" && (
                  <p className="text-xs text-[var(--error)] mt-1.5">Copy failed — check clipboard permissions</p>
                )}
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Anyone who funds a C-address through this link is attributed to your account.
                </p>
              </div>

              {/* The QR code needs a true white background to stay scannable
                  regardless of the app's light/dark theme, so this container
                  intentionally uses literal colors instead of the themed
                  --surface variable. */}
              <div className="shrink-0 self-start bg-white p-3 rounded-lg" data-testid="referral-qr-container">
                {qrSvg ? (
                  <div
                    role="img"
                    aria-label="QR code for your referral link"
                    className="w-44 h-44"
                    data-testid="referral-qr-svg"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                ) : qrError ? (
                  <div className="w-44 h-44 flex items-center justify-center text-center text-xs text-gray-500 px-2">
                    QR code unavailable
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-44 h-44 rounded bg-gray-200 animate-pulse motion-reduce:animate-none"
                  />
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-[var(--primary-light)]" />
                <span className="text-xs text-[var(--text-muted)]">Referred volume</span>
              </div>
              <div className="text-2xl font-bold" data-testid="referred-volume">
                {formatReferralAmount(stats.referredVolume)}
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-[var(--secondary)]" />
                <span className="text-xs text-[var(--text-muted)]">Referred transactions</span>
              </div>
              <div className="text-2xl font-bold" data-testid="referred-count">
                {stats.referredTransactionCount}
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Coins className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-xs text-[var(--text-muted)]">Accrued referral fees</span>
              </div>
              <div className="text-2xl font-bold" data-testid="accrued-fees">
                {formatReferralAmount(stats.accruedFees)}
              </div>
            </div>
          </div>

          <section aria-labelledby="referral-chart-heading" className="card p-5">
            <h2 id="referral-chart-heading" className="font-semibold mb-4">
              Referred volume over time
            </h2>

            {!hasReferralActivity(stats) ? (
              <div className="p-10 text-center" data-testid="referrals-empty-state">
                <p className="text-sm text-[var(--text-muted)]">
                  No referrals yet. Share your link above — referred volume and fees will show up here once
                  someone funds a C-address through it.
                </p>
              </div>
            ) : (
              <BarChart
                buckets={volumeBuckets}
                valueOf={(bucket) => bucket.volume}
                formatValue={formatReferralAmount}
                ariaLabel="Referred volume over time"
                color="var(--primary)"
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
