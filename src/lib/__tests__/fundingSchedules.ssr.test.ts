import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { loadNotifications } from "../notifications";
import {
  FUNDING_FREQUENCIES,
  MAX_FUNDING_SCHEDULES,
  SCHEDULE_LABEL_MAX_LENGTH,
  buildScheduleFundingLink,
  checkAndNotifyDueSchedules,
  computeNextRunAt,
  createFundingSchedule,
  deleteFundingSchedule,
  dueSchedules,
  formatFrequency,
  isFundingFrequency,
  isRenderableSchedule,
  isScheduleDue,
  loadFundingSchedules,
  markScheduleCompleted,
  pauseFundingSchedule,
  resumeFundingSchedule,
  updateFundingSchedule,
  validateFundingSchedule,
} from "../fundingSchedules";

/**
 * Unit tests for the recurring funding schedule store (#557). Structured
 * like `addressBook.test.ts`: interesting cases are untrusted-storage shapes
 * and the calendar/notification edge cases specific to "due on a recurring
 * cadence". SSR behaviour is covered separately in
 * `fundingSchedules.ssr.test.ts`.
 */

const C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());
const C_ADDRESS_2 = StrKey.encodeContract(Keypair.random().rawPublicKey());
const G_ADDRESS = Keypair.random().publicKey();

describe("recurring funding schedules (#557)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("validateFundingSchedule", () => {
    it("accepts a well-formed schedule", () => {
      const result = validateFundingSchedule(" Rent ", C_ADDRESS, "100", "USDC", "monthly");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.label).toBe("Rent"); // trimmed
        expect(result.targetAddress).toBe(C_ADDRESS);
      }
    });

    it("rejects an empty label", () => {
      const result = validateFundingSchedule("   ", C_ADDRESS, "100", "USDC", "monthly");
      expect(result).toEqual({ ok: false, error: "Label is required" });
    });

    it("rejects a label over the length budget", () => {
      const result = validateFundingSchedule("x".repeat(SCHEDULE_LABEL_MAX_LENGTH + 1), C_ADDRESS, "100", "USDC", "monthly");
      expect(result.ok).toBe(false);
    });

    it("rejects a G-address (must be a C-address, mirroring batch funding)", () => {
      const result = validateFundingSchedule("Rent", G_ADDRESS, "100", "USDC", "monthly");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("G-address");
    });

    it("rejects an invalid amount", () => {
      const result = validateFundingSchedule("Rent", C_ADDRESS, "-5", "USDC", "monthly");
      expect(result.ok).toBe(false);
    });

    it("rejects an unsupported asset", () => {
      const result = validateFundingSchedule("Rent", C_ADDRESS, "100", "BTC", "monthly");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Unsupported asset");
    });

    it("rejects an unsupported frequency", () => {
      const result = validateFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "daily");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Unsupported frequency");
    });
  });

  describe("computeNextRunAt", () => {
    it("advances weekly by exactly 7 days", () => {
      const from = Date.UTC(2026, 0, 1); // Jan 1, 2026
      expect(computeNextRunAt("weekly", from)).toBe(from + 7 * 24 * 60 * 60 * 1000);
    });

    it("advances biweekly by exactly 14 days", () => {
      const from = Date.UTC(2026, 0, 1);
      expect(computeNextRunAt("biweekly", from)).toBe(from + 14 * 24 * 60 * 60 * 1000);
    });

    it("advances monthly to the same day next month in the common case", () => {
      const from = Date.UTC(2026, 0, 15); // Jan 15, 2026
      const next = new Date(computeNextRunAt("monthly", from));
      expect(next.getUTCFullYear()).toBe(2026);
      expect(next.getUTCMonth()).toBe(1); // February
      expect(next.getUTCDate()).toBe(15);
    });

    it("clamps a month-end date instead of overflowing into the following month", () => {
      const from = Date.UTC(2026, 0, 31); // Jan 31, 2026
      const next = new Date(computeNextRunAt("monthly", from));
      // Feb 2026 has 28 days — must clamp to Feb 28, not spill into March.
      expect(next.getUTCMonth()).toBe(1);
      expect(next.getUTCDate()).toBe(28);
    });

    it("handles a December -> January year rollover", () => {
      const from = Date.UTC(2026, 11, 15); // Dec 15, 2026
      const next = new Date(computeNextRunAt("monthly", from));
      expect(next.getUTCFullYear()).toBe(2027);
      expect(next.getUTCMonth()).toBe(0);
      expect(next.getUTCDate()).toBe(15);
    });
  });

  describe("createFundingSchedule / loadFundingSchedules", () => {
    it("creates a schedule with nextRunAt one period ahead of startAt", () => {
      const startAt = Date.UTC(2026, 0, 1);
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", startAt);
      expect(schedule).not.toBeNull();
      expect(schedule!.nextRunAt).toBe(computeNextRunAt("weekly", startAt));
      expect(schedule!.paused).toBe(false);
      expect(loadFundingSchedules()).toHaveLength(1);
    });

    it("returns null and saves nothing for invalid input", () => {
      expect(createFundingSchedule("", C_ADDRESS, "100", "USDC", "weekly")).toBeNull();
      expect(loadFundingSchedules()).toHaveLength(0);
    });

    it("enforces the MAX_FUNDING_SCHEDULES cap", () => {
      for (let i = 0; i < MAX_FUNDING_SCHEDULES; i++) {
        expect(createFundingSchedule(`Sched ${i}`, C_ADDRESS, "10", "USDC", "weekly")).not.toBeNull();
      }
      expect(loadFundingSchedules()).toHaveLength(MAX_FUNDING_SCHEDULES);
      expect(createFundingSchedule("One too many", C_ADDRESS, "10", "USDC", "weekly")).toBeNull();
      expect(loadFundingSchedules()).toHaveLength(MAX_FUNDING_SCHEDULES);
    });
  });

  describe("isRenderableSchedule", () => {
    it("drops entries with an invalid target address (e.g. hand-edited storage)", () => {
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly");
      window.localStorage.setItem(
        "fundingSchedules:v1",
        JSON.stringify([{ ...schedule, targetAddress: "not-an-address" }])
      );
      expect(loadFundingSchedules()).toHaveLength(0);
    });

    it("drops entries with an unknown frequency", () => {
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly");
      window.localStorage.setItem(
        "fundingSchedules:v1",
        JSON.stringify([{ ...schedule, frequency: "yearly" }])
      );
      expect(loadFundingSchedules()).toHaveLength(0);
    });

    it("is fine with a non-object entry rejected outright", () => {
      expect(isRenderableSchedule("nope")).toBe(false);
      expect(isRenderableSchedule(null)).toBe(false);
    });
  });

  describe("updateFundingSchedule", () => {
    it("updates fields and recomputes nextRunAt when frequency changes", () => {
      const startAt = Date.UTC(2026, 0, 1);
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", startAt)!;
      const originalNextRunAt = schedule.nextRunAt;

      const ok = updateFundingSchedule(schedule.id, "Rent (updated)", C_ADDRESS_2, "150", "XLM", "monthly");
      expect(ok).toBe(true);

      const [updated] = loadFundingSchedules();
      expect(updated.label).toBe("Rent (updated)");
      expect(updated.targetAddress).toBe(C_ADDRESS_2);
      expect(updated.amount).toBe("150");
      expect(updated.asset).toBe("XLM");
      expect(updated.frequency).toBe("monthly");
      expect(updated.nextRunAt).not.toBe(originalNextRunAt);
    });

    it("leaves nextRunAt untouched when frequency doesn't change", () => {
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly")!;
      updateFundingSchedule(schedule.id, "Rent v2", C_ADDRESS, "200", "USDC", "weekly");
      const [updated] = loadFundingSchedules();
      expect(updated.nextRunAt).toBe(schedule.nextRunAt);
    });

    it("returns false for an unknown id", () => {
      expect(updateFundingSchedule("nope", "Rent", C_ADDRESS, "100", "USDC", "weekly")).toBe(false);
    });

    it("returns false and leaves storage untouched for invalid input", () => {
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly")!;
      expect(updateFundingSchedule(schedule.id, "", C_ADDRESS, "100", "USDC", "weekly")).toBe(false);
      expect(loadFundingSchedules()[0].label).toBe("Rent");
    });
  });

  describe("deleteFundingSchedule", () => {
    it("removes the schedule and returns true", () => {
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly")!;
      expect(deleteFundingSchedule(schedule.id)).toBe(true);
      expect(loadFundingSchedules()).toHaveLength(0);
    });

    it("returns false for an id that doesn't exist", () => {
      expect(deleteFundingSchedule("nope")).toBe(false);
    });
  });

  describe("pauseFundingSchedule / resumeFundingSchedule", () => {
    it("pausing excludes a due schedule from isScheduleDue", () => {
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", 0)!;
      expect(isScheduleDue(schedule, Date.now())).toBe(true);

      pauseFundingSchedule(schedule.id);
      const [paused] = loadFundingSchedules();
      expect(isScheduleDue(paused, Date.now())).toBe(false);

      resumeFundingSchedule(schedule.id);
      const [resumed] = loadFundingSchedules();
      expect(isScheduleDue(resumed, Date.now())).toBe(true);
    });
  });

  describe("dueSchedules", () => {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    it("returns only unpaused, overdue schedules, most overdue first", () => {
      const now = Date.UTC(2026, 5, 1);
      // startAt is one period *before* the due date, since nextRunAt = startAt + one period.
      const soon = createFundingSchedule("Soon", C_ADDRESS, "10", "USDC", "weekly", now - WEEK_MS - 1_000)!;
      const veryOverdue = createFundingSchedule("Very overdue", C_ADDRESS, "10", "USDC", "weekly", now - WEEK_MS - 100_000)!;
      const notYetDue = createFundingSchedule("Not due", C_ADDRESS, "10", "USDC", "weekly", now - WEEK_MS + 1_000_000)!;
      pauseFundingSchedule(
        createFundingSchedule("Paused but overdue", C_ADDRESS, "10", "USDC", "weekly", now - WEEK_MS - 5_000)!.id
      );

      const due = dueSchedules(loadFundingSchedules(), now);
      expect(due.map((s) => s.id)).toEqual([veryOverdue.id, soon.id]);
      expect(due.find((s) => s.id === notYetDue.id)).toBeUndefined();
    });
  });

  describe("markScheduleCompleted", () => {
    it("advances nextRunAt by one period from the occurrence that was due, not from now", () => {
      const dueAt = Date.UTC(2026, 0, 1);
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", dueAt - 7 * 24 * 60 * 60 * 1000)!;
      expect(schedule.nextRunAt).toBe(dueAt);

      // Completed 3 days late — cadence should still anchor to dueAt, not "now".
      const lateNow = dueAt + 3 * 24 * 60 * 60 * 1000;
      const updated = markScheduleCompleted(schedule.id, lateNow);

      expect(updated).not.toBeNull();
      expect(updated!.nextRunAt).toBe(computeNextRunAt("weekly", dueAt));
      expect(updated!.lastCompletedAt).toBe(lateNow);
    });

    it("returns null for an unknown id", () => {
      expect(markScheduleCompleted("nope")).toBeNull();
    });
  });

  describe("checkAndNotifyDueSchedules", () => {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    it("records a schedule notification for each newly-due schedule", () => {
      const now = Date.UTC(2026, 5, 1);
      createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", now - WEEK_MS - 1_000);
      createFundingSchedule("Not due yet", C_ADDRESS, "50", "USDC", "weekly", now - WEEK_MS + 1_000_000);

      const notified = checkAndNotifyDueSchedules(now);
      expect(notified).toHaveLength(1);
      expect(notified[0].label).toBe("Rent");

      const notifications = loadNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].kind).toBe("schedule");
      expect(notifications[0].title).toContain("due");
    });

    it("does not re-notify for the same due occurrence on a second call", () => {
      const now = Date.UTC(2026, 5, 1);
      createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", now - WEEK_MS - 1_000);

      expect(checkAndNotifyDueSchedules(now)).toHaveLength(1);
      expect(checkAndNotifyDueSchedules(now + 60_000)).toHaveLength(0);
      expect(loadNotifications()).toHaveLength(1);
    });

    it("notifies again once the schedule is completed and becomes due a second time", () => {
      const firstDueAt = Date.UTC(2026, 5, 1);
      const schedule = createFundingSchedule(
        "Rent",
        C_ADDRESS,
        "100",
        "USDC",
        "weekly",
        firstDueAt - 7 * 24 * 60 * 60 * 1000
      )!;

      expect(checkAndNotifyDueSchedules(firstDueAt)).toHaveLength(1);
      markScheduleCompleted(schedule.id, firstDueAt);

      const secondDueAt = computeNextRunAt("weekly", firstDueAt);
      expect(checkAndNotifyDueSchedules(secondDueAt)).toHaveLength(1);
      expect(loadNotifications()).toHaveLength(2);
    });

    it("does not notify for a paused schedule", () => {
      const now = Date.UTC(2026, 5, 1);
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", now - WEEK_MS - 1_000)!;
      pauseFundingSchedule(schedule.id);
      expect(checkAndNotifyDueSchedules(now)).toHaveLength(0);
      expect(loadNotifications()).toHaveLength(0);
    });
  });

  describe("buildScheduleFundingLink", () => {
    it("builds a funding link pre-filled with the schedule's target/amount/asset", () => {
      const schedule = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly")!;
      const link = buildScheduleFundingLink("https://example.com/bridge", schedule);
      const url = new URL(link);
      expect(url.searchParams.get("target")).toBe(C_ADDRESS);
      expect(url.searchParams.get("amount")).toBe("100");
      expect(url.searchParams.get("asset")).toBe("USDC");
    });
  });

  describe("formatFrequency / isFundingFrequency", () => {
    it("formats every supported frequency", () => {
      expect(formatFrequency("weekly")).toBe("Weekly");
      expect(formatFrequency("biweekly")).toBe("Every 2 weeks");
      expect(formatFrequency("monthly")).toBe("Monthly");
    });

    it("recognises exactly the supported frequency set", () => {
      for (const f of FUNDING_FREQUENCIES) expect(isFundingFrequency(f)).toBe(true);
      expect(isFundingFrequency("yearly")).toBe(false);
      expect(isFundingFrequency(42)).toBe(false);
    });
  });
});
