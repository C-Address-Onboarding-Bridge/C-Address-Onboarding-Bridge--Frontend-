// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { setConsentMock, telemetryState } = vi.hoisted(() => ({
  setConsentMock: vi.fn(),
  telemetryState: {
    consent: "pending" as "pending" | "granted" | "denied",
    isFirstVisit: true,
  },
}));

vi.mock("@/contexts/TelemetryContext", () => ({
  useTelemetry: () => ({
    ...telemetryState,
    setConsent: setConsentMock,
  }),
}));

import { TelemetryConsentPrompt } from "../TelemetryConsentPrompt";

describe("TelemetryConsentPrompt", () => {
  beforeEach(() => {
    telemetryState.consent = "pending";
    telemetryState.isFirstVisit = true;
    setConsentMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the consent details and actions for a first-time pending visitor", () => {
    render(<TelemetryConsentPrompt />);

    expect(screen.getByRole("heading", { name: "Help us improve your experience" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("records acceptance and closes the prompt", () => {
    render(<TelemetryConsentPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(setConsentMock).toHaveBeenCalledWith("granted");
    expect(screen.queryByRole("heading", { name: "Help us improve your experience" })).not.toBeInTheDocument();
  });

  it("records a decline when the decline action is selected", () => {
    render(<TelemetryConsentPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(setConsentMock).toHaveBeenCalledWith("denied");
    expect(screen.queryByRole("heading", { name: "Help us improve your experience" })).not.toBeInTheDocument();
  });

  it("does not show when consent is already decided or the visit is not new", () => {
    telemetryState.consent = "granted";
    const { rerender } = render(<TelemetryConsentPrompt />);
    expect(screen.queryByRole("heading", { name: "Help us improve your experience" })).not.toBeInTheDocument();

    telemetryState.consent = "pending";
    telemetryState.isFirstVisit = false;
    rerender(<TelemetryConsentPrompt />);
    expect(screen.queryByRole("heading", { name: "Help us improve your experience" })).not.toBeInTheDocument();
  });
});
