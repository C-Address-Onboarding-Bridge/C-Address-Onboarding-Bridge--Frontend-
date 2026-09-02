/**
 * Recurring funding schedule management (#557).
 *
 * There is no backend, and no way for a browser tab to execute a signed
 * transaction on a schedule while closed — the same "no backend" constraint
 * that shapes `addressBook.ts` and `fundingLink.ts`. A "schedule" here is
 * therefore a local reminder, not an automation: this module tracks when a
 * recurring funding is next due, and `checkAndNotifyDueSchedules` surfaces
 * that through the notification centre using its existing `"schedule"` kind
 * (see `notifications.ts`'s module docs — that kind was added in #477
 * specifically so a flow like this one could use it once it shipped).
 * Completing a due schedule is one click away via `buildScheduleFundingLink`,
 * which reuses `fundingLink.ts`'s pre-fill mechanism (`buildFundingLink`) so
 * the bridge/onramp form opens with the target address, amount and asset
 * already filled in — the user still sends it themselves.
 *
 * Storage/validation conventions mirror `addressBook.ts`: one JSON array in
 * `localStorage`, SSR-safe accessors, and every stored entry re-validated on
 * read so a corrupted or hand-edited record is dropped rather than breaking
 * the whole list.
 */
import { validateBatchAddress, validateBatchAmount } from "./batchFunding";
import { isCAddress, isValidStellarAmount } from "./stellar";
import { hasControlChars } from "./profile";
import { addNotification } from "./notifications";
import { FUNDING_LINK_ASSETS, buildFundingLink, type FundingLinkAsset } from "./fundingLink";
import { ROUTES } from "./routes";

/** Same budget as a recipient label (`RECIPIENT_LABEL_MAX_LENGTH` in addressBook.ts). */
export const SCHEDULE_LABEL_MAX_LENGTH = 32;

/** Cap on saved schedules, same reasoning/order of magnitude as MAX_BATCH_RECIPIENTS (types.ts). */
export const MAX_FUNDING_SCHEDULES = 20;

const STORAGE_KEY = "fundingSchedules:v1";

export const FUNDING_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type FundingFrequency = (typeof FUNDING_FREQUENCIES)[number];

export function isFundingFrequency(value: unknown): value is FundingFrequency {
  return typeof value === "string" && (FUNDING_FREQUENCIES as readonly string[]).includes(value);
}

function isFundingLinkAsset(value: unknown): value is FundingLinkAsset {
  return typeof value === "string" && (FUNDING_LINK_ASSETS as readonly string[]).includes(value);
}

export interface FundingSchedule {
  id: string;
  label: string;
  /** A Soroban C-address — recurring funding lands in a smart account, same restriction batchFunding.ts documents. */
  targetAddress: string;
  amount: string;
  asset: FundingLinkAsset;
  frequency: FundingFrequency;
  /** Epoch ms the next funding is due. */
  nextRunAt: number;
  createdAt: number;
  updatedAt: number;
  paused: boolean;
  /** Epoch ms the schedule was last marked completed, if ever. */
  lastCompletedAt?: number;
  /**
   * The `nextRunAt` value a "this is due" notification has already been sent
   * for. Lets `checkAndNotifyDueSchedules` run on every page load without
   * re-notifying for the same due occurrence.
   */
  lastNotifiedRunAt?: number;
}

export type ScheduleValidation =
  | {
      ok: true;
      label: string;
      targetAddress: string;
      amount: string;
      asset: FundingLinkAsset;
      frequency: FundingFrequency;
    }
  | { ok: false; error: string };

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Access itself throws in some privacy modes.
    return null;
  }
}

/**
 * Validates and normalises the fields of a new or edited schedule. Address
 * and amount validation are delegated to `batchFunding.ts`'s
 * `validateBatchAddress`/`validateBatchAmount` rather than re-implemented
 * here, so a recurring schedule and a one-off batch row always agree on what
 * counts as a valid C-address/amount for funding.
 */
export function validateFundingSchedule(
  rawLabel: string,
  rawTargetAddress: string,
  rawAmount: string,
  asset: string,
  frequency: string
): ScheduleValidation {
  const label = rawLabel.trim();
  if (!label) {
    return { ok: false, error: "Label is required" };
  }
  if (label.length > SCHEDULE_LABEL_MAX_LENGTH) {
    return { ok: false, error: `Label must be ${SCHEDULE_LABEL_MAX_LENGTH} characters or fewer` };
  }
  if (hasControlChars(label)) {
    return { ok: false, error: "Label cannot contain line breaks or control characters" };
  }

  const addressError = validateBatchAddress(rawTargetAddress);
  if (addressError) {
    return { ok: false, error: addressError };
  }

  const amountError = validateBatchAmount(rawAmount);
  if (amountError) {
    return { ok: false, error: amountError };
  }

  if (!isFundingLinkAsset(asset)) {
    return {
      ok: false,
      error: `Unsupported asset "${asset}". Supported assets: ${FUNDING_LINK_ASSETS.join(", ")}.`,
    };
  }

  if (!isFundingFrequency(frequency)) {
    return {
      ok: false,
      error: `Unsupported frequency "${frequency}". Supported: ${FUNDING_FREQUENCIES.join(", ")}.`,
    };
  }

  return {
    ok: true,
    label,
    targetAddress: rawTargetAddress.trim(),
    amount: rawAmount.trim(),
    asset,
    frequency,
  };
}

/** True when `value` is a stored schedule in the exact shape this module writes. */
export function isRenderableSchedule(value: unknown): value is FundingSchedule {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string" || !v.id) return false;
  if (typeof v.label !== "string" || !v.label || v.label.length > SCHEDULE_LABEL_MAX_LENGTH) return false;
  if (hasControlChars(v.label)) return false;
  if (typeof v.targetAddress !== "string" || !isCAddress(v.targetAddress)) return false;
  if (typeof v.amount !== "string" || !isValidStellarAmount(v.amount)) return false;
  if (!isFundingLinkAsset(v.asset)) return false;
  if (!isFundingFrequency(v.frequency)) return false;
  if (typeof v.nextRunAt !== "number" || !Number.isFinite(v.nextRunAt)) return false;
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) return false;
  if (typeof v.updatedAt !== "number" || !Number.isFinite(v.updatedAt)) return false;
  if (typeof v.paused !== "boolean") return false;
  if (v.lastCompletedAt !== undefined && (typeof v.lastCompletedAt !== "number" || !Number.isFinite(v.lastCompletedAt))) {
    return false;
  }
  if (v.lastNotifiedRunAt !== undefined && (typeof v.lastNotifiedRunAt !== "number" || !Number.isFinite(v.lastNotifiedRunAt))) {
    return false;
  }

  return true;
}

function readRaw(): unknown[] {
  const store = storage();
  if (!store) return [];

  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(schedules: FundingSchedule[]): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(schedules));
    return true;
  } catch {
    return false;
  }
}

function createScheduleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sched-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Advances `from` by one period of `frequency`. Monthly clamps to the last
 * day of the target month instead of overflowing into the month after (e.g.
 * Jan 31 + 1 month -> Feb 28/29, not Mar 3) — the same kind of calendar edge
 * case `computeNextRunAt`'s callers rely on being handled once, correctly,
 * rather than re-solved ad hoc.
 */
export function computeNextRunAt(frequency: FundingFrequency, from: number): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (frequency === "weekly") return from + 7 * DAY_MS;
  if (frequency === "biweekly") return from + 14 * DAY_MS;

  const d = new Date(from);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const daysInNextMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(d.getUTCDate(), daysInNextMonth));
  next.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
  return next.getTime();
}

/** Human-readable frequency label, e.g. for the schedule list. */
export function formatFrequency(frequency: FundingFrequency): string {
  switch (frequency) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Every 2 weeks";
    case "monthly":
      return "Monthly";
  }
}

/** Reads the saved schedules, dropping any entry that fails re-validation. */
export function loadFundingSchedules(): FundingSchedule[] {
  return readRaw().filter(isRenderableSchedule);
}

/**
 * Creates a new schedule. `startAt` (default: now) is the point the first
 * `nextRunAt` is computed one period forward from — exposed mainly for
 * deterministic tests; callers scheduling "starting today" can omit it.
 * Returns null when validation fails, the schedule cap
 * (`MAX_FUNDING_SCHEDULES`) is already reached, or the write failed.
 */
export function createFundingSchedule(
  rawLabel: string,
  rawTargetAddress: string,
  rawAmount: string,
  asset: string,
  frequency: string,
  startAt: number = Date.now()
): FundingSchedule | null {
  const result = validateFundingSchedule(rawLabel, rawTargetAddress, rawAmount, asset, frequency);
  if (!result.ok) return null;

  const existing = loadFundingSchedules();
  if (existing.length >= MAX_FUNDING_SCHEDULES) return null;

  const now = Date.now();
  const schedule: FundingSchedule = {
    id: createScheduleId(),
    label: result.label,
    targetAddress: result.targetAddress,
    amount: result.amount,
    asset: result.asset,
    frequency: result.frequency,
    nextRunAt: computeNextRunAt(result.frequency, startAt),
    createdAt: now,
    updatedAt: now,
    paused: false,
  };

  if (!persist([...existing, schedule])) return null;
  return schedule;
}

/**
 * Updates an existing schedule's editable fields by id. Changing the
 * frequency recomputes `nextRunAt` from now (rather than leaving a stale
 * cadence in place); everything else about `nextRunAt`/`paused` is left
 * untouched. Returns false when validation fails, the id doesn't exist, or
 * the write failed.
 */
export function updateFundingSchedule(
  id: string,
  rawLabel: string,
  rawTargetAddress: string,
  rawAmount: string,
  asset: string,
  frequency: string
): boolean {
  const result = validateFundingSchedule(rawLabel, rawTargetAddress, rawAmount, asset, frequency);
  if (!result.ok) return false;

  const existing = loadFundingSchedules();
  const index = existing.findIndex((s) => s.id === id);
  if (index === -1) return false;

  const current = existing[index];
  const frequencyChanged = current.frequency !== result.frequency;
  const updated: FundingSchedule = {
    ...current,
    label: result.label,
    targetAddress: result.targetAddress,
    amount: result.amount,
    asset: result.asset,
    frequency: result.frequency,
    nextRunAt: frequencyChanged ? computeNextRunAt(result.frequency, Date.now()) : current.nextRunAt,
    updatedAt: Date.now(),
  };

  const next = [...existing];
  next[index] = updated;
  return persist(next);
}

/** Removes a schedule by id. Returns false if the id wasn't found or the write failed. */
export function deleteFundingSchedule(id: string): boolean {
  const existing = loadFundingSchedules();
  const next = existing.filter((s) => s.id !== id);
  if (next.length === existing.length) return false;
  return persist(next);
}

/** Pauses a schedule (it is excluded from `dueSchedules`/notifications until resumed). */
export function pauseFundingSchedule(id: string): boolean {
  return setPaused(id, true);
}

/** Resumes a paused schedule. Does not change `nextRunAt` — a schedule paused while overdue is immediately due again. */
export function resumeFundingSchedule(id: string): boolean {
  return setPaused(id, false);
}

function setPaused(id: string, paused: boolean): boolean {
  const existing = loadFundingSchedules();
  const index = existing.findIndex((s) => s.id === id);
  if (index === -1) return false;
  const next = [...existing];
  next[index] = { ...existing[index], paused, updatedAt: Date.now() };
  return persist(next);
}

/** True when an unpaused schedule's `nextRunAt` has passed. */
export function isScheduleDue(schedule: Pick<FundingSchedule, "paused" | "nextRunAt">, now: number = Date.now()): boolean {
  return !schedule.paused && schedule.nextRunAt <= now;
}

/** Due schedules, most overdue first. */
export function dueSchedules(schedules: FundingSchedule[], now: number = Date.now()): FundingSchedule[] {
  return schedules.filter((s) => isScheduleDue(s, now)).sort((a, b) => a.nextRunAt - b.nextRunAt);
}

/**
 * Marks a schedule as completed for its current due occurrence: advances
 * `nextRunAt` by one period *from the occurrence that was due* (not from
 * `now`), so a schedule completed a few days late stays on its original
 * cadence instead of drifting later with every late completion. Records
 * `lastCompletedAt`. Returns null if the id doesn't exist or the write
 * failed.
 */
export function markScheduleCompleted(id: string, now: number = Date.now()): FundingSchedule | null {
  const existing = loadFundingSchedules();
  const index = existing.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const current = existing[index];
  const updated: FundingSchedule = {
    ...current,
    nextRunAt: computeNextRunAt(current.frequency, current.nextRunAt),
    lastCompletedAt: now,
    updatedAt: now,
  };

  const next = [...existing];
  next[index] = updated;
  if (!persist(next)) return null;
  return updated;
}

/**
 * Builds a pre-filled funding link for a schedule via `fundingLink.ts`'s
 * `buildFundingLink`, so acting on a due schedule never means re-typing the
 * address/amount by hand.
 */
export function buildScheduleFundingLink(baseUrl: string, schedule: Pick<FundingSchedule, "targetAddress" | "amount" | "asset">): string {
  return buildFundingLink(baseUrl, {
    target: schedule.targetAddress,
    amount: schedule.amount,
    asset: schedule.asset,
  });
}

/**
 * Checks for schedules that are due and haven't been notified for their
 * current `nextRunAt` yet, records one "schedule"-kind notification each via
 * `notifications.ts`'s `addNotification`, and stamps `lastNotifiedRunAt` so
 * re-running this on every page load doesn't re-notify for the same due
 * occurrence. Returns the schedules that were (newly) notified.
 */
export function checkAndNotifyDueSchedules(now: number = Date.now()): FundingSchedule[] {
  const schedules = loadFundingSchedules();
  const due = schedules.filter(
    (s) => isScheduleDue(s, now) && s.lastNotifiedRunAt !== s.nextRunAt
  );
  if (due.length === 0) return [];

  const dueIds = new Set(due.map((s) => s.id));
  const next = schedules.map((s) => (dueIds.has(s.id) ? { ...s, lastNotifiedRunAt: s.nextRunAt } : s));
  persist(next);

  for (const s of due) {
    addNotification({
      kind: "schedule",
      title: "Recurring funding due",
      message: `"${s.label}" — ${s.amount} ${s.asset} to ${s.targetAddress.slice(0, 8)}… is due.`,
      href: ROUTES.SCHEDULES,
    });
  }

  return due;
}
