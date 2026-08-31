import { describe, it, expect } from "vitest";
import {
  formatNextExecution,
  hasPendingExecution,
  sortSchedulesByNextExecution,
  validateScheduleEndDate,
  type FundingSchedule,
} from "../schedules";

const baseSchedule = (overrides: Partial<FundingSchedule> = {}): FundingSchedule => ({
  id: "1",
  sender: "GSENDER",
  recipient: "CRECIPIENT",
  amount: "10",
  asset: "XLM",
  interval: "monthly",
  status: "active",
  nextExecutionAt: 1_700_000_000_000,
  endDate: null,
  createdAt: 1_699_000_000_000,
  executions: [],
  network: "TESTNET",
  ...overrides,
});

describe("hasPendingExecution", () => {
  it("is true for an active schedule with a next execution", () => {
    expect(hasPendingExecution(baseSchedule({ status: "active", nextExecutionAt: 1000 }))).toBe(true);
  });

  it("is true for a paused schedule with a next execution — resuming would still run it", () => {
    expect(hasPendingExecution(baseSchedule({ status: "paused", nextExecutionAt: 1000 }))).toBe(true);
  });

  it("is false once cancelled", () => {
    expect(hasPendingExecution(baseSchedule({ status: "cancelled", nextExecutionAt: null }))).toBe(false);
  });

  it("is false once completed", () => {
    expect(hasPendingExecution(baseSchedule({ status: "completed", nextExecutionAt: null }))).toBe(false);
  });

  it("is false for an active schedule with no next execution queued (defensive)", () => {
    expect(hasPendingExecution(baseSchedule({ status: "active", nextExecutionAt: null }))).toBe(false);
  });
});

describe("validateScheduleEndDate", () => {
  it("accepts an empty value as 'no end date'", () => {
    const result = validateScheduleEndDate("");
    expect(result).toEqual({ ok: true, endDate: null });
  });

  it("rejects an unparseable date", () => {
    const result = validateScheduleEndDate("not-a-date");
    expect(result.ok).toBe(false);
  });

  it("rejects a date in the past", () => {
    const result = validateScheduleEndDate("2020-01-01T00:00", 1_700_000_000_000);
    expect(result.ok).toBe(false);
  });

  it("accepts a future date", () => {
    const future = new Date(2_000_000_000_000).toISOString().slice(0, 16);
    const result = validateScheduleEndDate(future, 1_000_000_000_000);
    expect(result.ok).toBe(true);
  });
});

describe("sortSchedulesByNextExecution", () => {
  it("sorts soonest-next-execution first", () => {
    const later = baseSchedule({ id: "later", nextExecutionAt: 3000 });
    const sooner = baseSchedule({ id: "sooner", nextExecutionAt: 1000 });
    const middle = baseSchedule({ id: "middle", nextExecutionAt: 2000 });
    const sorted = sortSchedulesByNextExecution([later, sooner, middle]);
    expect(sorted.map((s) => s.id)).toEqual(["sooner", "middle", "later"]);
  });

  it("sorts schedules with no next execution (cancelled/completed) after all active ones", () => {
    const active = baseSchedule({ id: "active", nextExecutionAt: 1000 });
    const cancelled = baseSchedule({ id: "cancelled", status: "cancelled", nextExecutionAt: null, createdAt: 500 });
    const sorted = sortSchedulesByNextExecution([cancelled, active]);
    expect(sorted.map((s) => s.id)).toEqual(["active", "cancelled"]);
  });

  it("sorts multiple terminal schedules newest-created first", () => {
    const older = baseSchedule({ id: "older", status: "completed", nextExecutionAt: null, createdAt: 1000 });
    const newer = baseSchedule({ id: "newer", status: "cancelled", nextExecutionAt: null, createdAt: 2000 });
    const sorted = sortSchedulesByNextExecution([older, newer]);
    expect(sorted.map((s) => s.id)).toEqual(["newer", "older"]);
  });
});

describe("formatNextExecution", () => {
  it("renders a date for an active schedule", () => {
    const schedule = baseSchedule({ status: "active", nextExecutionAt: 1_700_000_000_000 });
    expect(formatNextExecution(schedule)).toBe(new Date(1_700_000_000_000).toLocaleString());
  });

  it("marks a paused schedule as paused, but still shows when it would resume to run", () => {
    const schedule = baseSchedule({ status: "paused", nextExecutionAt: 1_700_000_000_000 });
    expect(formatNextExecution(schedule)).toContain("Paused");
    expect(formatNextExecution(schedule)).toContain(new Date(1_700_000_000_000).toLocaleString());
  });

  it("renders 'Cancelled' for a cancelled schedule", () => {
    expect(formatNextExecution(baseSchedule({ status: "cancelled", nextExecutionAt: null }))).toBe("Cancelled");
  });

  it("renders 'Completed' for a completed schedule", () => {
    expect(formatNextExecution(baseSchedule({ status: "completed", nextExecutionAt: null }))).toBe("Completed");
  });
});
