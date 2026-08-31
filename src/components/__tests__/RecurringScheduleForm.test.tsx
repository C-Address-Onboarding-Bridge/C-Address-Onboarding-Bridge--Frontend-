// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecurringScheduleForm from "../RecurringScheduleForm";
import type { FundingSchedule } from "@/lib/schedules";

/**
 * Unit tests for RecurringScheduleForm (#557): the schedule-creation half of
 * the checklist ("creation" in the issue's required test coverage).
 */

const VALID_RECIPIENT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

const makeSchedule = (overrides: Partial<FundingSchedule> = {}): FundingSchedule => ({
  id: "sched-1",
  sender: "GSENDER",
  recipient: VALID_RECIPIENT,
  amount: "10",
  asset: "XLM",
  interval: "monthly",
  status: "active",
  nextExecutionAt: Date.now() + 86_400_000,
  endDate: null,
  createdAt: Date.now(),
  executions: [],
  network: "TESTNET",
  ...overrides,
});

async function fillValidForm() {
  fireEvent.change(screen.getByTestId("schedule-recipient-input"), { target: { value: VALID_RECIPIENT } });
  fireEvent.change(screen.getByTestId("schedule-amount-input"), { target: { value: "25" } });
}

describe("RecurringScheduleForm (#557)", () => {
  it("disables review until recipient and amount are valid", () => {
    render(<RecurringScheduleForm onSubmit={vi.fn()} />);
    expect(screen.getByTestId("schedule-review-button")).toBeDisabled();
  });

  it("shows validation errors for an invalid recipient and amount once touched", async () => {
    render(<RecurringScheduleForm onSubmit={vi.fn()} />);
    const recipientInput = screen.getByTestId("schedule-recipient-input");
    const amountInput = screen.getByTestId("schedule-amount-input");
    fireEvent.change(recipientInput, { target: { value: "not-an-address" } });
    fireEvent.blur(recipientInput);
    fireEvent.change(amountInput, { target: { value: "-5" } });
    fireEvent.blur(amountInput);

    expect(await screen.findByTestId("schedule-recipient-error")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-amount-error")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-review-button")).toBeDisabled();
  });

  it("creates a schedule end-to-end: fill in, review, confirm, and show the result", async () => {
    const onSubmit = vi.fn().mockResolvedValue(makeSchedule());
    render(<RecurringScheduleForm onSubmit={onSubmit} />);

    await fillValidForm();
    fireEvent.change(screen.getByTestId("schedule-interval-select"), { target: { value: "weekly" } });
    fireEvent.click(screen.getByTestId("schedule-review-button"));

    expect(await screen.findByTestId("schedule-review-recipient")).toHaveTextContent(VALID_RECIPIENT);
    expect(screen.getByTestId("schedule-review-amount")).toHaveTextContent("25");

    fireEvent.click(screen.getByTestId("schedule-submit-button"));

    expect(await screen.findByTestId("schedule-confirmed")).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({
      recipient: VALID_RECIPIENT,
      amount: "25",
      asset: "XLM",
      interval: "weekly",
      endDate: null,
    });
  });

  it("passes a parsed end date through to onSubmit when one is set", async () => {
    const onSubmit = vi.fn().mockResolvedValue(makeSchedule());
    render(<RecurringScheduleForm onSubmit={onSubmit} />);

    await fillValidForm();
    const future = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 16);
    fireEvent.change(screen.getByTestId("schedule-end-date-input"), { target: { value: future } });
    fireEvent.click(screen.getByTestId("schedule-review-button"));
    fireEvent.click(await screen.findByTestId("schedule-submit-button"));

    await screen.findByTestId("schedule-confirmed");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ endDate: new Date(future).getTime() }));
  });

  it("rejects an end date in the past before allowing review", async () => {
    render(<RecurringScheduleForm onSubmit={vi.fn()} />);
    await fillValidForm();
    fireEvent.change(screen.getByTestId("schedule-end-date-input"), { target: { value: "2020-01-01T00:00" } });

    expect(await screen.findByTestId("schedule-end-date-error")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-review-button")).toBeDisabled();
  });

  it("shows a submit error and returns to the review step when creation fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Insufficient balance"));
    render(<RecurringScheduleForm onSubmit={onSubmit} />);

    await fillValidForm();
    fireEvent.click(screen.getByTestId("schedule-review-button"));
    fireEvent.click(await screen.findByTestId("schedule-submit-button"));

    expect(await screen.findByTestId("schedule-submit-error")).toHaveTextContent("Insufficient balance");
    expect(screen.getByTestId("schedule-submit-button")).toBeInTheDocument();
  });
});
