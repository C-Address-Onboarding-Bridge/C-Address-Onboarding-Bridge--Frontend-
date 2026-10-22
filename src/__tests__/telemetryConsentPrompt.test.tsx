// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TelemetryProvider } from "@/contexts/TelemetryContext";
import { getConsentStatus } from "@/lib/telemetry";

describe("telemetry consent prompt (#865)", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("shows the dialog on a first visit", () => {
    render(<TelemetryProvider><p>app</p></TelemetryProvider>);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Decline persists denied and a remount does not show the dialog", () => {
    const first = render(<TelemetryProvider><p>app</p></TelemetryProvider>);
    fireEvent.click(screen.getByText("Decline"));
    expect(getConsentStatus()).toBe("denied");
    first.unmount();
    render(<TelemetryProvider><p>app</p></TelemetryProvider>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the X button persists denied", () => {
    render(<TelemetryProvider><p>app</p></TelemetryProvider>);
    fireEvent.click(screen.getByLabelText("Decline telemetry"));
    expect(getConsentStatus()).toBe("denied");
  });
});
