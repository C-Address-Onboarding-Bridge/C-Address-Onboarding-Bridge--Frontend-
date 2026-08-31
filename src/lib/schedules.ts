/**
 * Recurring funding schedules — pure logic (#557).
 *
 * PLACEHOLDER INTERFACE: this repo vendors neither a schedule contract nor a
 * real API client for recurring funding yet (no contract source, no
 * schedule-related route, nothing in docs — checked before writing this).
 * The shape below and the routes in `src/lib/api.ts` are a best guess,
 * mirroring the existing timelock placeholder in `src/lib/locks.ts`, and
 * MUST be reconciled against the real contract/API once available.
 *
 * Execution status is computed server-side (whether an execution ran, and
 * whether it succeeded) since only the backend knows the outcome of a
 * submitted transaction. What's derivable purely from a `FundingSchedule` on
 * the client is: whether it still has something left to run
 * (`hasPendingExecution`), how to sort/display it, and whether a typed end
 * date is valid.
 */
import type { StellarNetwork } from "./types";

export type ScheduleInterval = "daily" | "weekly" | "monthly";
export type ScheduleStatus = "active" | "paused" | "cancelled" | "completed";
export type ScheduleExecutionStatus = "success" | "failed";

export const SCHEDULE_INTERVALS: ScheduleInterval[] = ["daily", "weekly", "monthly"];

export const SCHEDULE_INTERVAL_LABELS: Record<ScheduleInterval, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export interface ScheduleExecution {
  id: string;
  /** Epoch milliseconds this execution was scheduled to run at. */
  scheduledAt: number;
  status: ScheduleExecutionStatus;
  /** Present when `status === "success"`. */
  txHash?: string;
  /** Present when `status === "failed"`. */
  error?: string;
}

export interface FundingSchedule {
  id: string;
  sender: string;
  recipient: string;
  amount: string;
  asset: string;
  interval: ScheduleInterval;
  status: ScheduleStatus;
  /** Epoch milliseconds of the next run, or `null` once cancelled/completed. */
  nextExecutionAt: number | null;
  /** Epoch milliseconds, or `null` for a schedule with no end date. */
  endDate: number | null;
  createdAt: number;
  executions: ScheduleExecution[];
  network: StellarNetwork;
}

/**
 * True while cancelling this schedule would prevent a future execution from
 * happening — i.e. it's not already in a terminal state and still has a next
 * run queued. A paused schedule still counts: resuming it would eventually
 * execute, so cancelling it from "paused" loses that future run too.
 */
export function hasPendingExecution(schedule: Pick<FundingSchedule, "status" | "nextExecutionAt">): boolean {
  return (schedule.status === "active" || schedule.status === "paused") && schedule.nextExecutionAt !== null;
}

/**
 * Validates an end date typed into a `datetime-local` input. Unlike
 * `validateUnlockTime` in `locks.ts`, an empty value is valid here — it
 * means "no end date, run until cancelled" rather than a required field.
 */
export function validateScheduleEndDate(
  raw: string,
  now: number = Date.now()
): { ok: true; endDate: number | null } | { ok: false; error: string } {
  if (!raw) {
    return { ok: true, endDate: null };
  }
  const parsed = new Date(raw).getTime();
  if (Number.isNaN(parsed)) {
    return { ok: false, error: "Invalid date/time" };
  }
  if (parsed <= now) {
    return { ok: false, error: "End date must be in the future" };
  }
  return { ok: true, endDate: parsed };
}

/** Sorts schedules soonest-next-execution first; schedules with none (cancelled/completed) sort last, newest first. */
export function sortSchedulesByNextExecution(schedules: FundingSchedule[]): FundingSchedule[] {
  return [...schedules].sort((a, b) => {
    if (a.nextExecutionAt === null && b.nextExecutionAt === null) return b.createdAt - a.createdAt;
    if (a.nextExecutionAt === null) return 1;
    if (b.nextExecutionAt === null) return -1;
    return a.nextExecutionAt - b.nextExecutionAt;
  });
}

/** Renders a schedule's next-execution column: a date, "Paused (resumes to …)", or a terminal label. */
export function formatNextExecution(schedule: Pick<FundingSchedule, "status" | "nextExecutionAt">): string {
  if (schedule.status === "cancelled") return "Cancelled";
  if (schedule.status === "completed") return "Completed";
  if (schedule.nextExecutionAt === null) return "—";
  const label = new Date(schedule.nextExecutionAt).toLocaleString();
  return schedule.status === "paused" ? `Paused (resumes to run ${label})` : label;
}
