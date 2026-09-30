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
 *
 * Schedules are scoped to a network (#693): a testnet schedule must not show
 * up — or be acted on — while the app is on mainnet, where the same C-address
 * may belong to someone else or not exist. Storage is keyed per network, and
 * any pre-existing unscoped list is migrated once into the current network's
 * bucket on first read.
 */
import { validateBatchAddress, validateBatchAmount } from "./batchFunding";
import { isCAddress, isValidStellarAmount } from "./stellar";
import { hasControlChars } from "./profile";
import { addNotification } from "./notifications";
import { FUNDING_LINK_ASSETS, buildFundingLink, type FundingLinkAsset } from "./fundingLink";
import { ROUTES } from "./routes";
import { getNetwork, type StellarNetwork } from "./network";

/** Same budget as a recipient label (`RECIPIENT_LABEL_MAX_LENGTH` in addressBook.ts). */
export const SCHEDULE_LABEL_MAX_LENGTH = 32;

/** Cap on saved schedules, same reasoning/order of magnitude as MAX_BATCH_RECIPIENTS (types.ts). */
export const MAX_FUNDING_SCHEDULES = 20;

/** Legacy, unscoped key. Read once for migration, then left untouched. */
const LEGACY_STORAGE_KEY = "fundingSchedules:v1";

/** Per-network storage key, e.g. `fundingSchedules:v1:testnet`. */
export function fundingSchedulesStorageKey(network: StellarNetwork): string {
  return `${LEGACY_STORAGE_KEY}:${network}`;
}

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
  /**
   * Day-of-month (1-31) the monthly schedule is anchored to. Monthly runs are
   * always computed from this anchor rather than from the previous (possibly
   * clamped) run date, so a schedule on the 31st returns to the 31st after a
   * short month instead of drifting to the 28th forever (#692).
   */
  anchorDay?: number;
  createdAt: number;
  updatedAt: number;
  paused: boolean;
  /** Network this schedule belongs to (#693). */
  network: StellarNetwork;
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
  if (v.anchorDay !== undefined && (!Number.isInteger(v.anchorDay) || v.anchorDay < 1 || v.anchorDay > 31)) {
    return false;
  }
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) return false;
  if (typeof v.updatedAt !== "number" || !Number.isFinite(v.updatedAt)) return false;
  if (typeof v.paused !== "boolean") return false;
  if (v.network !== "mainnet" && v.network !== "testnet") return false;
  if (v.lastCompletedAt !== undefined && (typeof v.lastCompletedAt !== "number" || !Number.isFinite(v.lastCompletedAt))) {
    return false;
  }
  if (v.lastNotifiedRunAt !== undefined && (typeof v.lastNotifiedRunAt !== "number" || !Number.isFinite(v.lastNotifiedRunAt))) {
    return false;
  }

  return true;
}

/**
 * One-time migration (#693): moves any pre-existing unscoped list into the
 * current network's bucket, stamping each entry with that network. Runs at
 * most once per network — the legacy key is removed after a successful move
 * so a later network switch cannot re-import the same entries.
 */
function migrateLegacySchedules(store: Storage, network: StellarNetwork): void {
  let raw: string | null;
  try {
    raw = store.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const entries = Array.isArray(parsed) ? parsed : [];
  const migrated = entries
    .filter(isRenderableSchedule)
    .map((schedule) => ({ ...schedule, network }));

  const key = fundingSchedulesStorageKey(network);
  try {
    if (migrated.length > 0) {
      const existing = store.getItem(key);
      let current: FundingSchedule[] = [];
      if (existing) {
        try {
          const parsedExisting = JSON.parse(existing);
          if (Array.isArray(parsedExisting)) {
            current = parsedExisting.filter(isRenderableSchedule);
          }
        } catch {
          current = [];
        }
      }
      const merged = [...current, ...migrated].slice(0, MAX_FUNDING_SCHEDULES);
      store.setItem(key, JSON.stringify(merged));
    }
    store.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage full or blocked — leave the legacy key in place to retry later.
  }
}

function readRaw(): unknown[] {
  const store = storage();
  if (!store) return [];

  const network = getNetwork();
  migrateLegacySchedules(store, network);

  let raw: string | null;
  try {
    raw = store.getItem(fundingSchedulesStorageKey(network));
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
    store.setItem(fundingSchedulesStorageKey(getNetwork()), JSON.stringify(schedules));
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
 *
 * Monthly schedules must pass the original `anchorDay` (day-of-month, 1-31)
 * so each run is computed from the anchor rather than from the previous,
 * possibly-clamped run date. Without it a schedule on the 31st would clamp to
 * the 28th in February and then stay on the 28th forever (#692). When
 * `anchorDay` is omitted the day-of-month of `from` is used as the anchor.
 */
export function computeNextRunAt(frequency: FundingFrequency, from: number, anchorDay?: number): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (frequency === "weekly") return from + 7 * DAY_MS;
  if (frequency === "biweekly") return from + 14 * DAY_MS;

  const base = new Date(from);
  const anchor = anchorDay ?? base.getDate();
  const year = base.getFullYear();
  const month = base.getMonth() + 1;
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(anchor, lastDayOfTargetMonth);
  return new Date(year, month, day, base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds()).getTime();
}

/**
 * The day-of-month a monthly schedule is anchored to. Prefers the stored
 * `anchorDay` and falls back to the day-of-month of `nextRunAt` for schedules
 * saved before the anchor was persisted (#692).
 */
export function scheduleAnchorDay(schedule: FundingSchedule): number {
  if (typeof schedule.anchorDay === "number") return schedule.anchorDay;
  return new Date(schedule.nextRunAt).getDate();
}

/* … rest of file unchanged … */
