// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { TelemetryProvider, useTelemetry } from "@/contexts/TelemetryContext";
import {
  TELEMETRY_CONSENT_KEY,
  TELEMETRY_FIRST_VISIT_KEY,
  TELEMETRY_STORAGE_KEY,
  getBufferedEvents,
  setConsentStatus,
} from "@/lib/telemetry";

/**
 * TelemetryContext exposes consent state to the rest of the app (#756).
 *
 * Writing these exposed two bugs, fixed alongside: the provider used
 * `useHydrated` without importing it and checked an undefined `isHydrated`, so
 * it threw on every render; and before hydration it returned its children
 * without a provider, so a child calling useTelemetry() would have thrown.
 */

function Probe() {
  const { consent, isFirstVisit, isEnabled, setConsent, captureEvent } = useTelemetry();
  return (
    <div>
      <span data-testid="consent">{consent}</span>
      <span data-testid="first-visit">{String(isFirstVisit)}</span>
      <span data-testid="enabled">{String(isEnabled)}</span>
      <button onClick={() => setConsent("granted")}>probe grant</button>
      <button onClick={() => setConsent("denied")}>probe deny</button>
      <button onClick={() => setConsent("pending")}>probe reset</button>
      <button onClick={() => captureEvent("probe_event", { a: 1 })}>probe event</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <TelemetryProvider>
      <Probe />
    </TelemetryProvider>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const prompt = () => screen.queryByRole("dialog");

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TelemetryProvider", () => {
  it("starts pending, first visit, disabled, and shows the consent prompt", () => {
    renderProvider();
    expect(text("consent")).toBe("pending");
    expect(text("first-visit")).toBe("true");
    expect(text("enabled")).toBe("false");
    expect(prompt()).not.toBeNull();
  });

  it("restores a stored grant without prompting again", () => {
    setConsentStatus("granted");
    renderProvider();
    expect(text("consent")).toBe("granted");
    expect(text("enabled")).toBe("true");
    expect(text("first-visit")).toBe("false");
    expect(prompt()).toBeNull();
  });

  it("restores a stored denial as disabled, without a prompt", () => {
    setConsentStatus("denied");
    renderProvider();
    expect(text("consent")).toBe("denied");
    expect(text("enabled")).toBe("false");
    expect(prompt()).toBeNull();
  });

  it("treats corrupt stored consent as pending", () => {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, "{not json");
    renderProvider();
    expect(text("consent")).toBe("pending");
  });

  it("accepting in the prompt grants, persists, enables and records the change", () => {
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(text("consent")).toBe("granted");
    expect(text("enabled")).toBe("true");
    expect(text("first-visit")).toBe("false");
    expect(prompt()).toBeNull();
    expect(JSON.parse(localStorage.getItem(TELEMETRY_CONSENT_KEY)!).consent).toBe("granted");
    expect(localStorage.getItem(TELEMETRY_STORAGE_KEY)).toBe("true");
    expect(getBufferedEvents().map((e) => e.name)).toContain("telemetry_consent_changed");
  });

  it("declining persists the denial, disables collection and records nothing", () => {
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(text("consent")).toBe("denied");
    expect(text("enabled")).toBe("false");
    expect(prompt()).toBeNull();
    expect(localStorage.getItem(TELEMETRY_STORAGE_KEY)).not.toBe("true");
    expect(getBufferedEvents()).toEqual([]);
  });

  it("the close (X) button declines as well", () => {
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: "Decline telemetry" }));
    expect(text("consent")).toBe("denied");
    expect(prompt()).toBeNull();
  });

  it("revoking a grant disables collection and clears buffered events", () => {
    renderProvider();
    fireEvent.click(screen.getByText("probe grant"));
    fireEvent.click(screen.getByText("probe event"));
    expect(getBufferedEvents().some((e) => e.name === "probe_event")).toBe(true);

    fireEvent.click(screen.getByText("probe deny"));
    expect(text("enabled")).toBe("false");
    expect(getBufferedEvents()).toEqual([]);
  });

  it("captureEvent only records after consent is granted", () => {
    renderProvider();
    fireEvent.click(screen.getByText("probe event"));
    expect(getBufferedEvents()).toEqual([]);

    fireEvent.click(screen.getByText("probe grant"));
    fireEvent.click(screen.getByText("probe event"));
    expect(getBufferedEvents().find((e) => e.name === "probe_event")?.properties).toEqual({ a: 1 });
  });

  it("setting consent back to pending records no consent event and is not a first visit", () => {
    renderProvider();
    fireEvent.click(screen.getByText("probe reset"));
    expect(text("consent")).toBe("pending");
    expect(text("first-visit")).toBe("false");
    expect(getBufferedEvents()).toEqual([]);
    expect(localStorage.getItem(TELEMETRY_FIRST_VISIT_KEY)).not.toBeNull();
  });

  it("server-renders with the context available and no prompt", () => {
    setConsentStatus("granted");
    const html = renderToString(
      <TelemetryProvider>
        <Probe />
      </TelemetryProvider>
    );
    // Deterministic pre-hydration defaults, so server and client markup match.
    expect(html).toContain(">pending<");
    expect(html).toContain(">false<");
    expect(html).not.toContain('role="dialog"');
  });
});

describe("useTelemetry", () => {
  it("throws outside a TelemetryProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/within TelemetryProvider/);
  });
});
