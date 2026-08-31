// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import RecurringSchedulesPanel from "../recurring-schedules-panel";
import type { FundingSchedule } from "@/lib/schedules";

/**
 * Unit tests for RecurringSchedulesPanel (#557).
 *
 * `@/lib/api`'s schedule routes are a placeholder interface (see
 * `src/lib/schedules.ts` and `src/lib/api.ts`) — mocked here the same way
 * `claims-panel.test.tsx` mocks the lock routes, so the panel's own
 * polling/action/history logic is what's under test, not a real network call.
 */

const { listSchedulesMock, pauseScheduleMock, resumeScheduleMock, cancelScheduleMock } = vi.hoisted(() => ({
  listSchedulesMock: vi.fn(),
  pauseScheduleMock: vi.fn(),
  resumeScheduleMock: vi.fn(),
  cancelScheduleMock: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listSchedules: listSchedulesMock,
    pauseSchedule: pauseScheduleMock,
    resumeSchedule: resumeScheduleMock,
    cancelSchedule: cancelScheduleMock,
  };
});

const ADDRESS = "GSENDER00000000000000000000000000000000000000000000000";

const makeSchedule = (overrides: Partial<FundingSchedule> = {}): FundingSchedule => ({
  id: "sched-1",
  sender: ADDRESS,
  recipient: "CRECIPIENT0000000000000000000000000000000000000000000",
  amount: "100",
  asset: "XLM",
  interval: "monthly",
  status: "active",
  nextExecutionAt: Date.now() + 86_400_000,
  endDate: null,
  createdAt: Date.now() - 86_400_000,
  executions: [],
  network: "TESTNET",
  ...overrides,
});

describe("RecurringSchedulesPanel (#557)", () => {
  beforeEach(() => {
    listSchedulesMock.mockReset();
    pauseScheduleMock.mockReset();
    resumeScheduleMock.mockReset();
    cancelScheduleMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing without a connected address", () => {
    const { container } = render(<RecurringSchedulesPanel address={null} network="TESTNET" isNetworkSupported={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an empty state when there are no schedules", async () => {
    listSchedulesMock.mockResolvedValue([]);
    render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);

    expect(await screen.findByText(/no recurring funding schedules/i)).toBeInTheDocument();
  });

  describe("cancellation", () => {
    it("cancels immediately when the schedule has no pending execution (defensive edge case)", async () => {
      const schedule = makeSchedule({ status: "active", nextExecutionAt: null });
      listSchedulesMock.mockResolvedValue([schedule]);
      cancelScheduleMock.mockResolvedValue({ ...schedule, status: "cancelled", nextExecutionAt: null });

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      const cancelButton = await screen.findByTestId(`cancel-button-${schedule.id}`);
      fireEvent.click(cancelButton);

      expect(screen.queryByTestId(`cancel-warning-${schedule.id}`)).not.toBeInTheDocument();
      await waitFor(() => expect(cancelScheduleMock).toHaveBeenCalledWith(schedule.id, "TESTNET"));
    });

    it("warns before cancelling a schedule with a pending execution, and does not cancel until confirmed", async () => {
      const schedule = makeSchedule({ status: "active", nextExecutionAt: Date.now() + 3600_000 });
      listSchedulesMock.mockResolvedValue([schedule]);

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      const cancelButton = await screen.findByTestId(`cancel-button-${schedule.id}`);
      fireEvent.click(cancelButton);

      expect(await screen.findByTestId(`cancel-warning-${schedule.id}`)).toBeInTheDocument();
      expect(cancelScheduleMock).not.toHaveBeenCalled();
    });

    it("keeping the schedule dismisses the warning without cancelling", async () => {
      const schedule = makeSchedule({ status: "active", nextExecutionAt: Date.now() + 3600_000 });
      listSchedulesMock.mockResolvedValue([schedule]);

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      fireEvent.click(await screen.findByTestId(`cancel-button-${schedule.id}`));
      fireEvent.click(await screen.findByTestId(`cancel-keep-button-${schedule.id}`));

      expect(screen.queryByTestId(`cancel-warning-${schedule.id}`)).not.toBeInTheDocument();
      expect(cancelScheduleMock).not.toHaveBeenCalled();
    });

    it("confirming the warning cancels the schedule and updates its status", async () => {
      const schedule = makeSchedule({ status: "active", nextExecutionAt: Date.now() + 3600_000 });
      listSchedulesMock.mockResolvedValue([schedule]);
      cancelScheduleMock.mockResolvedValue({ ...schedule, status: "cancelled", nextExecutionAt: null });

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      fireEvent.click(await screen.findByTestId(`cancel-button-${schedule.id}`));
      fireEvent.click(await screen.findByTestId(`cancel-confirm-button-${schedule.id}`));

      expect(cancelScheduleMock).toHaveBeenCalledWith(schedule.id, "TESTNET");
      await waitFor(() => expect(screen.getByTestId(`schedule-status-${schedule.id}`)).toHaveTextContent("cancelled"));
      // A cancelled schedule is terminal — no more pause/resume/cancel actions.
      expect(screen.queryByTestId(`cancel-button-${schedule.id}`)).not.toBeInTheDocument();
    });

    it("shows failure feedback and leaves the schedule active when cancellation fails", async () => {
      const schedule = makeSchedule({ status: "active", nextExecutionAt: Date.now() + 3600_000 });
      listSchedulesMock.mockResolvedValue([schedule]);
      cancelScheduleMock.mockRejectedValue(new Error("Network error"));

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      fireEvent.click(await screen.findByTestId(`cancel-button-${schedule.id}`));
      fireEvent.click(await screen.findByTestId(`cancel-confirm-button-${schedule.id}`));

      expect(await screen.findByTestId(`schedule-feedback-${schedule.id}`)).toHaveTextContent("Network error");
      expect(screen.getByTestId(`schedule-status-${schedule.id}`)).toHaveTextContent("active");
    });
  });

  describe("pause / resume", () => {
    it("pauses an active schedule", async () => {
      const schedule = makeSchedule({ status: "active" });
      listSchedulesMock.mockResolvedValue([schedule]);
      pauseScheduleMock.mockResolvedValue({ ...schedule, status: "paused" });

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      fireEvent.click(await screen.findByTestId(`pause-button-${schedule.id}`));

      expect(pauseScheduleMock).toHaveBeenCalledWith(schedule.id, "TESTNET");
      await waitFor(() => expect(screen.getByTestId(`schedule-status-${schedule.id}`)).toHaveTextContent("paused"));
      expect(await screen.findByTestId(`resume-button-${schedule.id}`)).toBeInTheDocument();
    });

    it("resumes a paused schedule", async () => {
      const schedule = makeSchedule({ status: "paused" });
      listSchedulesMock.mockResolvedValue([schedule]);
      resumeScheduleMock.mockResolvedValue({ ...schedule, status: "active" });

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      fireEvent.click(await screen.findByTestId(`resume-button-${schedule.id}`));

      expect(resumeScheduleMock).toHaveBeenCalledWith(schedule.id, "TESTNET");
      await waitFor(() => expect(screen.getByTestId(`schedule-status-${schedule.id}`)).toHaveTextContent("active"));
    });
  });

  describe("execution history", () => {
    it("shows a failed execution in the expanded history", async () => {
      const schedule = makeSchedule({
        executions: [
          { id: "exec-1", scheduledAt: Date.now() - 1000, status: "success", txHash: "abc123" },
          { id: "exec-2", scheduledAt: Date.now() - 2000, status: "failed", error: "Insufficient balance" },
        ],
      });
      listSchedulesMock.mockResolvedValue([schedule]);

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      fireEvent.click(await screen.findByTestId(`schedule-history-toggle-${schedule.id}`));

      expect(await screen.findByTestId("execution-status-exec-2")).toHaveTextContent("Failed");
      expect(screen.getByTestId("execution-row-exec-2")).toHaveTextContent("Insufficient balance");
      expect(screen.getByTestId("execution-status-exec-1")).toHaveTextContent("Success");
    });

    it("shows an empty history state when there are no executions yet", async () => {
      const schedule = makeSchedule({ executions: [] });
      listSchedulesMock.mockResolvedValue([schedule]);

      render(<RecurringSchedulesPanel address={ADDRESS} network="TESTNET" isNetworkSupported={true} />);
      fireEvent.click(await screen.findByTestId(`schedule-history-toggle-${schedule.id}`));

      expect(await screen.findByTestId(`schedule-history-${schedule.id}`)).toHaveTextContent(/no executions yet/i);
    });
  });
});
