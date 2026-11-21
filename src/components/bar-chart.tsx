/**
 * SVG bar chart for 30-day activity rollups (transaction count or volume).
 *
 * Keeps dependencies minimal (pure SVG, no recharts/d3 bundle cost).
 * Expects already-bucketed, chronological data.
 *
 * Generic over the datum type so callers bring their own bucket shape (only
 * `date`/`label` are required); `formatValue` is explicit rather than
 * baked in, since different callers format volume vs. a plain count.
 *
 * Screen-reader accessibility:
 * When SVG has role="img", child <title> elements are presentational and
 * inaccessible to screen reader navigation. A visually hidden <dl> linked via
 * aria-describedby provides full text equivalence for all buckets (#1112).
 */
import React, { useId } from "react";

export interface BarChartDatum {
  /** Used as the React key. */
  date: string;
  /** Short label for the X axis / tooltip, e.g. "Apr 12". */
  label: string;
}

export interface BarChartProps<T extends BarChartDatum> {
  buckets: T[];
  valueOf: (datum: T) => number;
  formatValue: (value: number) => string;
  ariaLabel: string;
  color: string;
}

/** Each bar carries a <title> with its value, and the chart is described by a screen-reader data list. */
export function BarChart<T extends BarChartDatum>({
  buckets,
  valueOf,
  formatValue,
  ariaLabel,
  color,
}: BarChartProps<T>) {
  const chartId = useId();
  const descId = `bar-chart-desc-${chartId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // Handle empty data without dividing by zero or rendering Infinity slot widths
  if (!buckets || buckets.length === 0) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        className="w-full h-36 flex items-center justify-center text-sm text-[var(--text-muted)] bg-[var(--surface-2)]/30 rounded-lg border border-dashed border-[var(--border)]"
      >
        No activity in this period
      </div>
    );
  }

  const getDatumValue = (bucket: T): number => {
    if (typeof valueOf === "function" && valueOf !== Object.prototype.valueOf) {
      const v = Number(valueOf(bucket));
      return Number.isFinite(v) ? Math.max(0, v) : 0;
    }
    return 0;
  };

  // Clamp values so negative numbers never produce negative bar heights or inverted coordinates
  const sanitizedValues = buckets.map(getDatumValue);
  const max = Math.max(...sanitizedValues, 1);
  const width = 600;
  const height = 140;
  const gap = 2;
  const slot = width / buckets.length;
  const barWidth = Math.max(2, slot - gap * 2);

  return (
    <div className="w-full relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className="w-full h-36"
        preserveAspectRatio="none"
      >
        {buckets.map((bucket, index) => {
          const value = getDatumValue(bucket);
          const barHeight = (value / max) * (height - 8);
          return (
            <rect
              key={bucket.date}
              x={index * slot + gap}
              y={height - barHeight - 4}
              width={barWidth}
              height={value > 0 ? Math.max(barHeight, 1) : 0}
              rx={1}
              fill={color}
            >
              <title>{`${bucket.label}: ${formatValue(value)}`}</title>
            </rect>
          );
        })}
      </svg>

      {/* Screen-reader accessible data list linked via aria-describedby */}
      <dl id={descId} className="sr-only">
        {buckets.map((bucket) => {
          const value = getDatumValue(bucket);
          return (
            <div key={bucket.date}>
              <dt>{bucket.label}</dt>
              <dd>{formatValue(value)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
