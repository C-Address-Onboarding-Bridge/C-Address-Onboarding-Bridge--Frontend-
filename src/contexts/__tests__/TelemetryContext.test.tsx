import React from "react";
import "@testing-library/jest-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { TelemetryProvider, useTelemetry } from "../TelemetryContext";
import {
  TELEMETRY_CONSENT_KEY,
  TELEMETRY_STORAGE_KEY,
  TELEMETRY_FIRST_VISIT_KEY,
  getBufferedEvents,
  clearTelemetryConsent,
} from "@/lib/telemetry";

function TestConsumer() {
  const { consent, isFirstVisit, isEnabled, setConsent, captureEvent } = useTelemetry();
  return (
    <div>
      <span data-testid="consent">{consent}</span>
      <span data-testid="first-visit">{String(isFirstVisit)}</span>
      <span data-testid="enabled">{String(isEnabled)}</span>
      <button data-testid="grant-btn" onClick={() => setConsent("granted")}>
        Grant
      </button>
      <button data-testid="deny-btn" onClick={() => setConsent("denied")}>
        Deny
      </button>
      <button data-testid="pending-btn" onClick={() => setConsent("pending")}>
        Reset
      </button>
      <button
        data-testid="event-btn"
        onClick={() => captureEvent("test_action", { foo: "bar" })}
      >
        Track
      </button>
    </div>
  );
}

describe("TelemetryContext", () => {
  beforeEach(() => {
    localStorage.clear();
    clearTelemetryConsent();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    clearTelemetryConsent();
  });

  describe("Hook Usage", () => {
    it("throws a clear error when useTelemetry is called outside TelemetryProvider", () => {
      // Suppress React console error output for this expected boundary throw
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => render(<TestConsumer />)).toThrow(
        "useTelemetry must be used within TelemetryProvider"
      );
      consoleSpy.mockRestore();
    });
  });

  describe("Initialization & Persisted Storage", () => {
    it("initializes with pending consent and firstVisit=true when no storage exists", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      expect(screen.getByTestId("consent")).toHaveTextContent("pending");
      expect(screen.getByTestId("first-visit")).toHaveTextContent("true");
      expect(screen.getByTestId("enabled")).toHaveTextContent("false");

      // Displays the TelemetryConsentPrompt dialog when consent is pending on first visit
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/Help us improve your experience/i)).toBeInTheDocument();
    });

    it("restores granted consent and enabled state from localStorage", () => {
      localStorage.setItem(
        TELEMETRY_CONSENT_KEY,
        JSON.stringify({ consent: "granted", timestamp: Date.now(), version: 1 })
      );
      localStorage.setItem(TELEMETRY_FIRST_VISIT_KEY, String(Date.now() - 50000));
      localStorage.setItem(TELEMETRY_STORAGE_KEY, "true");

      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      expect(screen.getByTestId("consent")).toHaveTextContent("granted");
      expect(screen.getByTestId("first-visit")).toHaveTextContent("false");
      expect(screen.getByTestId("enabled")).toHaveTextContent("true");

      // Does not show the consent prompt modal
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("restores denied consent and disabled state from localStorage", () => {
      localStorage.setItem(
        TELEMETRY_CONSENT_KEY,
        JSON.stringify({ consent: "denied", timestamp: Date.now(), version: 1 })
      );
      localStorage.setItem(TELEMETRY_FIRST_VISIT_KEY, String(Date.now() - 50000));
      localStorage.setItem(TELEMETRY_STORAGE_KEY, "false");

      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      expect(screen.getByTestId("consent")).toHaveTextContent("denied");
      expect(screen.getByTestId("first-visit")).toHaveTextContent("false");
      expect(screen.getByTestId("enabled")).toHaveTextContent("false");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Consent Updates via setConsent", () => {
    it("updates state, persists to localStorage, and buffers consent event on grant", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      expect(screen.getByTestId("consent")).toHaveTextContent("pending");

      act(() => {
        fireEvent.click(screen.getByTestId("grant-btn"));
      });

      expect(screen.getByTestId("consent")).toHaveTextContent("granted");
      expect(screen.getByTestId("first-visit")).toHaveTextContent("false");
      expect(screen.getByTestId("enabled")).toHaveTextContent("true");

      // Prompt dialog is dismissed
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Persisted in localStorage
      const stored = JSON.parse(localStorage.getItem(TELEMETRY_CONSENT_KEY) || "{}");
      expect(stored.consent).toBe("granted");
      expect(localStorage.getItem(TELEMETRY_STORAGE_KEY)).toBe("true");

      // Emitted consent event
      const events = getBufferedEvents();
      expect(events.some((e) => e.name === "telemetry_consent_changed" && e.properties?.consent === "granted")).toBe(true);
    });

    it("updates state, persists to localStorage, and disables collection on deny", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("deny-btn"));
      });

      expect(screen.getByTestId("consent")).toHaveTextContent("denied");
      expect(screen.getByTestId("first-visit")).toHaveTextContent("false");
      expect(screen.getByTestId("enabled")).toHaveTextContent("false");

      // Prompt dialog is dismissed
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Persisted in localStorage
      const stored = JSON.parse(localStorage.getItem(TELEMETRY_CONSENT_KEY) || "{}");
      expect(stored.consent).toBe("denied");
      expect(localStorage.getItem(TELEMETRY_STORAGE_KEY)).toBe("false");
    });

    it("does not emit telemetry_consent_changed when setting consent back to pending", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("pending-btn"));
      });

      expect(screen.getByTestId("consent")).toHaveTextContent("pending");
      const events = getBufferedEvents();
      expect(events.length).toBe(0);
    });
  });

  describe("Interactive Modal Integration", () => {
    it("dismisses prompt and grants consent when clicking 'Accept' in the modal", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      const acceptBtn = screen.getByRole("button", { name: /^accept$/i });
      expect(acceptBtn).toBeInTheDocument();

      act(() => {
        fireEvent.click(acceptBtn);
      });

      expect(screen.getByTestId("consent")).toHaveTextContent("granted");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("dismisses prompt and denies consent when clicking 'Decline' in the modal", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      const declineBtn = screen.getByRole("button", { name: /^decline$/i });
      expect(declineBtn).toBeInTheDocument();

      act(() => {
        fireEvent.click(declineBtn);
      });

      expect(screen.getByTestId("consent")).toHaveTextContent("denied");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Event Capture through Context", () => {
    it("buffers events when consent is granted", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("grant-btn"));
      });

      act(() => {
        fireEvent.click(screen.getByTestId("event-btn"));
      });

      const events = getBufferedEvents();
      expect(events.some((e) => e.name === "test_action" && e.properties?.foo === "bar")).toBe(true);
    });

    it("does not buffer events when consent is pending or denied", () => {
      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      // Pending: click track
      act(() => {
        fireEvent.click(screen.getByTestId("event-btn"));
      });
      expect(getBufferedEvents().filter((e) => e.name === "test_action").length).toBe(0);

      // Deny: click track
      act(() => {
        fireEvent.click(screen.getByTestId("deny-btn"));
      });
      act(() => {
        fireEvent.click(screen.getByTestId("event-btn"));
      });
      expect(getBufferedEvents().filter((e) => e.name === "test_action").length).toBe(0);
    });
  });
});
