"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Calendar, Check, ChevronDown, ChevronUp, Loader2, Pause, Play, Repeat, X } from "lucide-react";
import { cancelSchedule, listSchedules, pauseSchedule, resumeSchedule } from "@/lib/api";
import {
  formatNextExecution,
  hasPendingExecution,
  sortSchedulesByNextExecution,
  SCHEDULE_INTERVAL_LABELS,
  type FundingSchedule,
} from "@/lib/schedules";
import type { StellarNetwork } from "@/lib/types";
import LiveRegion from "@/components/live-region";

/** How often the panel re-fetches schedule status from the API. */
const SCHEDULES_POLL_INTERVAL_MS = 15_000;

interface RecurringSchedulesPanelProps {
  address: string | null;
  network: StellarNetwork;
  isNetworkSupported: boolean;
}

interface ActionFeedback {
  scheduleId: string;
  ok: boolean;
  message: string;
}

/** Shortens an address for display: CABCDEFG…WXYZ. */
function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 8)}…${address.slice(-4)}` : address;
}

/**
 * Lists recurring funding schedules sent from the connected address and lets
 * the sender pause, resume, or cancel each one, with its execution history
 * (including failures) available per row (#557).
 *
 * Polls the API on an interval, mirroring `ClaimsPanel` (#467), so a change
 * made from another session/device is reflected here too.
 */
export default function RecurringSchedulesPanel({ address, network, isNetworkSupported }: RecurringSchedulesPanelProps) {
  const [schedules, setSchedules] = useState<FundingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const actingRef = useRef<string | null>(null);

  const refresh = useMemo(
    () => async (isInitial: boolean) => {
      if (!address || !isNetworkSupported) return;
      if (isInitial) setLoading(true);
      try {
        const result = await listSchedules(address, network);
        setSchedules(sortSchedulesByNextExecution(result));
        setError(null);
      } catch {
        // A failed poll leaves the last-known list in place rather than
        // clearing it, the same tradeoff ClaimsPanel makes.
        setError("Couldn't refresh funding schedules. Retrying shortly.");
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [address, network, isNetworkSupported]
  );

  useEffect(() => {
    if (!address || !isNetworkSupported) {
      setSchedules([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const tick = (isInitial: boolean) => {
      if (cancelled) return;
      refresh(isInitial);
    };
    tick(true);
    const interval = setInterval(() => {
      if (document.hidden) return;
      tick(false);
    }, SCHEDULES_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) tick(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [address, network, isNetworkSupported, refresh]);

  const runAction = async (
    schedule: FundingSchedule,
    action: (id: string, network: StellarNetwork) => Promise<FundingSchedule>,
    verb: string
  ) => {
    // Guards against a double-click firing the same action twice while the
    // first request is still in flight, the same guard ClaimsPanel uses.
    if (actingRef.current) return;
    actingRef.current = schedule.id;
    setActingId(schedule.id);
    setFeedback(null);
    try {
      const updated = await action(schedule.id, network);
      setSchedules((prev) => sortSchedulesByNextExecution(prev.map((s) => (s.id === updated.id ? updated : s))));
      setFeedback({ scheduleId: schedule.id, ok: true, message: `Schedule ${verb}.` });
    } catch (e) {
      setFeedback({
        scheduleId: schedule.id,
        ok: false,
        message: e instanceof Error ? e.message : `Failed to ${verb}. Please try again.`,
      });
    } finally {
      actingRef.current = null;
      setActingId(null);
    }
  };

  const handlePause = (schedule: FundingSchedule) => runAction(schedule, pauseSchedule, "paused");
  const handleResume = (schedule: FundingSchedule) => runAction(schedule, resumeSchedule, "resumed");

  const handleCancelClick = (schedule: FundingSchedule) => {
    if (hasPendingExecution(schedule)) {
      setConfirmingCancelId(schedule.id);
      return;
    }
    runAction(schedule, cancelSchedule, "cancelled");
  };

  const handleConfirmCancel = (schedule: FundingSchedule) => {
    setConfirmingCancelId(null);
    runAction(schedule, cancelSchedule, "cancelled");
  };

  if (!address) return null;

  const announcement = feedback ? (feedback.ok ? feedback.message : `Action failed. ${feedback.message}`) : "";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]" data-testid="recurring-schedules-panel">
      <LiveRegion politeness={feedback?.ok === false ? "assertive" : "polite"} message={announcement} />
      <div className="p-5 border-b border-[var(--border)]">
        <h3 className="font-semibold">Recurring Funding Schedules</h3>
      </div>

      {error && (
        <div role="alert" className="mx-5 mt-4 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-xs text-[var(--error)]">
          {error}
        </div>
      )}

      {loading ? (
        <div role="status" className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-[var(--text-muted)]" />
          <span className="sr-only">Loading funding schedules…</span>
        </div>
      ) : schedules.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">No recurring funding schedules yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {schedules.map((schedule) => {
            const isThisActing = actingId === schedule.id;
            const rowFeedback = feedback?.scheduleId === schedule.id ? feedback : null;
            const isExpanded = expandedId === schedule.id;
            const isConfirmingCancel = confirmingCancelId === schedule.id;
            const isTerminal = schedule.status === "cancelled" || schedule.status === "completed";

            return (
              <div key={schedule.id} data-testid={`schedule-row-${schedule.id}`} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] flex items-center justify-center flex-shrink-0">
                      <Repeat className="w-4 h-4 text-[var(--primary-light)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {schedule.amount} {schedule.asset} · {SCHEDULE_INTERVAL_LABELS[schedule.interval]}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] font-mono truncate">
                        to {truncateAddress(schedule.recipient)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p data-testid={`schedule-status-${schedule.id}`} className="text-xs font-medium text-[var(--text-muted)] capitalize">
                      {schedule.status}
                    </p>
                    <p
                      data-testid={`schedule-next-execution-${schedule.id}`}
                      className="text-xs text-[var(--text-muted)] mt-0.5 inline-flex items-center gap-1"
                    >
                      <Calendar className="w-3 h-3" />
                      {formatNextExecution(schedule)}
                    </p>
                  </div>
                </div>

                {!isTerminal && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {schedule.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => handlePause(schedule)}
                        disabled={isThisActing}
                        data-testid={`pause-button-${schedule.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleResume(schedule)}
                        disabled={isThisActing}
                        data-testid={`resume-button-${schedule.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCancelClick(schedule)}
                      disabled={isThisActing}
                      data-testid={`cancel-button-${schedule.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--error)]/30 text-[var(--error)] text-xs font-medium hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50"
                    >
                      {isThisActing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      Cancel
                    </button>
                  </div>
                )}

                {isConfirmingCancel && (
                  <div
                    role="alertdialog"
                    aria-label="Confirm cancellation"
                    data-testid={`cancel-warning-${schedule.id}`}
                    className="mt-3 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3"
                  >
                    <AlertCircle className="w-4 h-4 text-[var(--error)] flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-[var(--error)]">
                        This schedule has a pending execution ({formatNextExecution(schedule)}). Cancelling stops all
                        future executions — this can&apos;t be undone.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingCancelId(null)}
                          data-testid={`cancel-keep-button-${schedule.id}`}
                          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] transition-colors"
                        >
                          Keep Schedule
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmCancel(schedule)}
                          data-testid={`cancel-confirm-button-${schedule.id}`}
                          className="px-3 py-1.5 rounded-lg bg-[var(--error)] text-white text-xs font-medium hover:bg-[var(--error)]/90 transition-colors"
                        >
                          Cancel Schedule
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {rowFeedback && (
                  <p
                    role={rowFeedback.ok ? "status" : "alert"}
                    data-testid={`schedule-feedback-${schedule.id}`}
                    className={`mt-2 text-xs flex items-center gap-1 ${
                      rowFeedback.ok ? "text-[var(--success)]" : "text-[var(--error)]"
                    }`}
                  >
                    {rowFeedback.ok ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {rowFeedback.message}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : schedule.id)}
                  data-testid={`schedule-history-toggle-${schedule.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:underline"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {isExpanded ? "Hide" : "View"} execution history ({schedule.executions.length})
                </button>

                {isExpanded && (
                  <div
                    className="mt-2 border border-[var(--border)] rounded-lg overflow-x-auto"
                    data-testid={`schedule-history-${schedule.id}`}
                  >
                    {schedule.executions.length === 0 ? (
                      <p className="p-3 text-xs text-[var(--text-muted)]">No executions yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] text-xs">
                            <th className="px-3 py-2">Scheduled</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.executions.map((execution) => (
                            <tr key={execution.id} data-testid={`execution-row-${execution.id}`} className="border-t border-[var(--border)]">
                              <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                                {new Date(execution.scheduledAt).toLocaleString()}
                              </td>
                              <td className="px-3 py-2">
                                {execution.status === "success" ? (
                                  <span
                                    data-testid={`execution-status-${execution.id}`}
                                    className="inline-flex items-center gap-1 text-xs text-[var(--success)]"
                                  >
                                    <Check className="w-3 h-3" />
                                    Success
                                  </span>
                                ) : (
                                  <span
                                    data-testid={`execution-status-${execution.id}`}
                                    role="alert"
                                    className="inline-flex items-center gap-1 text-xs text-[var(--error)]"
                                  >
                                    <AlertCircle className="w-3 h-3" />
                                    Failed
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-[var(--text-muted)] font-mono">
                                {execution.status === "success" ? execution.txHash ?? "—" : execution.error ?? "Unknown error"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
