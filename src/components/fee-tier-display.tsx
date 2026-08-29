"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BadgePercent, Info } from "lucide-react";
import {
  computeTieredFee,
  formatFeeRate,
  hasConfiguredTiers,
  isTopTier,
  progressToNextTier,
  type FeeTier,
  type FeeTierStatus,
} from "@/lib/feeTiers";

interface TierInfoButtonProps {
  tiers: FeeTier[];
}

/**
 * Small info-button popover explaining the tier structure (#468 requirement
 * 3). Mirrors FeatureFlagPanel's toggle-button/dialog pattern (aria-expanded
 * trigger, Escape to close) at a much smaller scale — a static list needs no
 * focus trap, just a way to open and close it.
 */
function TierInfoButton({ tiers }: TierInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Fee tier breakdown"
        data-testid="tier-info-button"
        className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Fee tier breakdown"
          data-testid="tier-info-panel"
          className="absolute right-0 z-10 mt-2 w-64 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg text-xs space-y-1.5"
        >
          <p className="font-medium mb-1">Fee tiers</p>
          {tiers.map((tier) => (
            <div key={tier.name} className="flex justify-between gap-2 text-[var(--text-muted)]">
              <span>
                {tier.name} ({tier.volumeThreshold.toLocaleString()}+)
              </span>
              <span className="flex-shrink-0">{formatFeeRate(tier.feeRate)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface FeeTierDisplayProps {
  /** null hides the whole display — either no tiers are configured, or the preview hasn't loaded (#468 requirement 5). */
  status: FeeTierStatus | null;
  /** When provided, shows the tiered fee quoted for this specific transfer amount. */
  amount?: number;
  asset?: string;
}

/**
 * Shows the connected account's current fee tier, effective rate, and
 * progress toward the next tier — or, at the top tier, that there's nothing
 * further to progress toward (#468).
 *
 * Renders nothing when `status` has no configured tiers, so a page that
 * embeds this never has to duplicate the hide-when-empty check itself.
 */
export default function FeeTierDisplay({ status, amount, asset }: FeeTierDisplayProps) {
  if (!hasConfiguredTiers(status)) return null;

  const progress = progressToNextTier(status);
  const tieredFee = amount !== undefined ? computeTieredFee(amount, status) : null;

  return (
    <div
      className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]"
      data-testid="fee-tier-display"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <BadgePercent className="w-3.5 h-3.5 text-[var(--primary-light)] flex-shrink-0" />
          <span className="text-sm font-medium" data-testid="current-tier-name">
            {status.currentTier.name} tier
          </span>
          <span className="text-xs text-[var(--text-muted)]" data-testid="current-tier-rate">
            — {formatFeeRate(status.currentTier.feeRate)} fee
          </span>
        </div>
        <TierInfoButton tiers={status.tiers} />
      </div>

      {tieredFee !== null && (
        <p className="text-xs text-[var(--text-muted)] mb-2" data-testid="tiered-fee-quote">
          Fee for this transfer: {tieredFee.toFixed(7)} {asset}
        </p>
      )}

      {isTopTier(status) ? (
        <p className="text-xs text-[var(--success)] font-medium" data-testid="top-tier-message">
          Top tier reached — you have the maximum discount.
        </p>
      ) : (
        progress && (
          <div data-testid="tier-progress">
            <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>
                {progress.currentVolume.toLocaleString()} / {progress.nextThreshold.toLocaleString()} volume
              </span>
              <span>
                Next: {status.nextTier!.name} ({formatFeeRate(status.nextTier!.feeRate)})
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(progress.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress toward ${status.nextTier!.name} tier`}
              className="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden"
            >
              <div
                className="h-full bg-[var(--primary)] transition-[width]"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}
