// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import FundingSchedulesPage from "@/components/routes/funding-schedules-page";
import { createFundingSchedule } from "@/lib/fundingSchedules";

/**
 * Unit tests for the Funding Schedules page (#557).
 *
 * Covers add/edit/pause/delete through the UI and the "due" banner/actions —
 * pure storage/calendar/notification rules live in
 * `src/lib/__tests__/fundingSchedules.test.ts`.
 */

const C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());
const C_ADDRESS_2 = StrKey.encodeContract(Keypair.random().rawPublicKey());
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describe("FundingSchedulesPage (#557)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows an empty state with no saved schedules", () => {
    render(<FundingSchedulesPage />);
    expect(screen.getByText("No recurring schedules yet.")).toBeInTheDocument();
  });

  it("loads schedules saved before mount", async () => {
    createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly");
    render(<FundingSchedulesPage />);
    expect(await screen.findByText("Rent")).toBeInTheDocument();
  });

  it("adds a schedule through the form", async () => {
    render(<FundingSchedulesPage />);

    fireEvent.change(screen.getByTestId("schedule-label-input"), { target: { value: "Rent" } });
    fireEvent.change(screen.getByTestId("schedule-address-input"), { target: { value: C_ADDRESS } });
    fireEvent.change(screen.getByTestId("schedule-amount-input"), { target: { value: "100" } });
    fireEvent.click(screen.getByTestId("add-schedule-button"));

    expect(await screen.findByText("Rent")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-label-input")).toHaveValue("");
  });

  it("rejects a G-address and shows why, without saving", async () => {
    render(<FundingSchedulesPage />);
    const gAddress = Keypair.random().publicKey();

    fireEvent.change(screen.getByTestId("schedule-label-input"), { target: { value: "Rent" } });
    fireEvent.change(screen.getByTestId("schedule-address-input"), { target: { value: gAddress } });
    fireEvent.change(screen.getByTestId("schedule-amount-input"), { target: { value: "100" } });
    fireEvent.click(screen.getByTestId("add-schedule-button"));

    expect(await screen.findByTestId("add-schedule-error")).toHaveTextContent(/G-address/);
    expect(screen.queryByText("Rent")).not.toBeInTheDocument();
  });

  it("edits a schedule in place", async () => {
    const saved = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly")!;
    render(<FundingSchedulesPage />);
    await screen.findByText("Rent");

    fireEvent.click(screen.getByTestId(`edit-button-${saved.id}`));
    fireEvent.change(screen.getByTestId(`edit-label-input-${saved.id}`), { target: { value: "Rent Updated" } });
    fireEvent.change(screen.getByTestId(`edit-address-input-${saved.id}`), { target: { value: C_ADDRESS_2 } });
    fireEvent.click(screen.getByTestId(`save-edit-${saved.id}`));

    expect(await screen.findByText("Rent Updated")).toBeInTheDocument();
  });

  it("cancels an edit without saving changes", async () => {
    createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly");
    render(<FundingSchedulesPage />);
    const saved = await screen.findByText("Rent");
    const row = saved.closest("li")!;

    fireEvent.click(within(row).getByLabelText(/Edit Rent/));
    const editId = row.querySelector('[data-testid^="edit-label-input-"]')!.getAttribute("data-testid")!.replace("edit-label-input-", "");
    fireEvent.change(screen.getByTestId(`edit-label-input-${editId}`), { target: { value: "Discarded" } });
    fireEvent.click(screen.getByTestId(`cancel-edit-${editId}`));

    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("deletes a schedule", async () => {
    const saved = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly")!;
    render(<FundingSchedulesPage />);
    await screen.findByText("Rent");

    fireEvent.click(screen.getByTestId(`delete-button-${saved.id}`));

    await waitFor(() => {
      expect(screen.queryByText("Rent")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No recurring schedules yet.")).toBeInTheDocument();
  });

  it("pauses and resumes a schedule", async () => {
    const saved = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly")!;
    render(<FundingSchedulesPage />);
    await screen.findByText("Rent");

    fireEvent.click(screen.getByTestId(`toggle-pause-${saved.id}`));
    expect(await screen.findByText("(paused)")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`toggle-pause-${saved.id}`));
    await waitFor(() => {
      expect(screen.queryByText("(paused)")).not.toBeInTheDocument();
    });
  });

  it("ignores a corrupted stored entry instead of crashing the page", async () => {
    const saved = createFundingSchedule("Good", C_ADDRESS, "100", "USDC", "weekly")!;
    const raw = JSON.parse(window.localStorage.getItem("fundingSchedules:v1")!);
    window.localStorage.setItem(
      "fundingSchedules:v1",
      JSON.stringify([...raw, { ...saved, id: "bad", targetAddress: "not-an-address" }])
    );

    expect(() => render(<FundingSchedulesPage />)).not.toThrow();
    expect(await screen.findByText("Good")).toBeInTheDocument();
  });

  describe("due schedules", () => {
    it("shows the due banner and 'Mark sent' / 'Open link' actions for an overdue schedule", async () => {
      const saved = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", Date.now() - WEEK_MS - 1_000)!;
      render(<FundingSchedulesPage />);

      expect(await screen.findByTestId("due-banner")).toHaveTextContent("Rent");
      expect(screen.getByTestId(`mark-completed-${saved.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`open-link-${saved.id}`)).toBeInTheDocument();
    });

    it("marking a due schedule as sent removes it from the due banner", async () => {
      const saved = createFundingSchedule("Rent", C_ADDRESS, "100", "USDC", "weekly", Date.now() - WEEK_MS - 1_000)!;
      render(<FundingSchedulesPage />);
      await screen.findByTestId("due-banner");

      fireEvent.click(screen.getByTestId(`mark-completed-${saved.id}`));

      await waitFor(() => {
        expect(screen.queryByTestId("due-banner")).not.toBeInTheDocument();
      });
    });

    it("does not show the due banner for a schedule that isn't due yet", () => {
      createFundingSchedule("Future", C_ADDRESS, "100", "USDC", "weekly", Date.now() + 1_000_000);
      render(<FundingSchedulesPage />);
      expect(screen.queryByTestId("due-banner")).not.toBeInTheDocument();
    });
  });
});
