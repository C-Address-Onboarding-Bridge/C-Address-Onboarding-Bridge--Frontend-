"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { fetchRecentActivity, type FundingActivityEvent } from "@/lib/activityFeed";

const POLL_INTERVAL_MS = 15_000;

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Anonymised live activity feed for the landing page (#489). Shows that the
 * bridge is actually being used — recent funding events with amounts and
 * truncated addresses only — without exposing anything that could identify
 * a user. Polls `/api/activity` periodically, pausing while the tab is
 * hidden so a backgrounded tab doesn't keep polling for nothing.
 */
export function RecentActivityFeed() {
  const [events, setEvents] = useState<FundingActivityEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const data = await fetchRecentActivity();
      if (!cancelled) {
        setEvents(data);
        setLoaded(true);
      }
    };

    const startPolling = () => {
      if (intervalRef.current) return;
      load();
      intervalRef.current = setInterval(load, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24"
      aria-label="Recent bridge activity"
    >
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[var(--primary-light)]" />
          <h2 className="font-semibold">Recent Activity</h2>
        </div>

        {!loaded ? (
          <p className="text-sm text-[var(--text-muted)]" data-testid="activity-loading">
            Loading recent activity…
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]" data-testid="activity-empty">
            No funding activity in the last little while — check back soon.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="activity-list">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between text-sm"
                data-testid="activity-item"
              >
                <span className="font-mono text-[var(--text-muted)]">{event.address}</span>
                <span className="font-medium">
                  {event.amount} {event.asset}
                </span>
                <span className="text-[var(--text-muted)]">{formatRelativeTime(event.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default RecentActivityFeed;
