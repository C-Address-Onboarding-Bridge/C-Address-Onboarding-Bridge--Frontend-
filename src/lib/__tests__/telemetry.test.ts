import { describe, it, expect, beforeEach } from "vitest";
import {
  TELEMETRY_CONSENT_KEY,
  TELEMETRY_FIRST_VISIT_KEY,
  TELEMETRY_STORAGE_KEY,
  getConsentStatus,
  setConsentStatus,
  isFirstVisit,
  isTelemetryEnabled,
  enableTelemetry,
  disableTelemetry,
  clearTelemetryConsent,
  type TelemetryConsent,
} from "@/lib/telemetry";

const NOW = 1_700_000_000_000;

describe("telemetry consent management", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to pending consent on first visit", () => {
    expect(getConsentStatus()).toBe("pending");
    expect(isFirstVisit()).toBe(true);
  });

  it("disables telemetry by default", () => {
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("persists granted consent", () => {
    setConsentStatus("granted", NOW);
    expect(getConsentStatus()).toBe("granted");
    expect(isTelemetryEnabled()).toBe(true);
  });

  it("persists denied consent", () => {
    setConsentStatus("denied", NOW);
    expect(getConsentStatus()).toBe("denied");
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("marks first visit when consent is given", () => {
    setConsentStatus("granted", NOW);
    expect(isFirstVisit()).toBe(false);
  });

  it("enables telemetry when granted", () => {
    enableTelemetry();
    expect(isTelemetryEnabled()).toBe(true);
  });

  it("disables telemetry when denied", () => {
    enableTelemetry();
    disableTelemetry();
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("stores consent with version and timestamp", () => {
    setConsentStatus("granted", NOW);
    const stored = localStorage.getItem(TELEMETRY_CONSENT_KEY);
    expect(stored).toBeTruthy();

    const config = JSON.parse(stored!);
    expect(config.consent).toBe("granted");
    expect(config.timestamp).toBe(NOW);
    expect(config.version).toBe(1);
  });

  it("handles corrupt stored data gracefully", () => {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, "invalid json");
    expect(getConsentStatus()).toBe("pending");
  });

  it("clears all telemetry consent", () => {
    setConsentStatus("granted", NOW);
    clearTelemetryConsent();
    expect(getConsentStatus()).toBe("pending");
    expect(isFirstVisit()).toBe(true);
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("recognizes first visit only once", () => {
    expect(isFirstVisit()).toBe(true);
    setConsentStatus("granted", NOW);
    expect(isFirstVisit()).toBe(false);
    // Second call should still return false
    expect(isFirstVisit()).toBe(false);
  });

  it("survives consent state changes", () => {
    setConsentStatus("granted", NOW);
    expect(getConsentStatus()).toBe("granted");
    setConsentStatus("denied", NOW + 1000);
    expect(getConsentStatus()).toBe("denied");
  });

  it("handles all valid consent states", () => {
    const states: TelemetryConsent[] = ["pending", "granted", "denied"];
    for (const state of states) {
      setConsentStatus(state, NOW);
      expect(getConsentStatus()).toBe(state);
    }
  });

  it("accepts invalid consent gracefully", () => {
    localStorage.setItem(
      TELEMETRY_CONSENT_KEY,
      JSON.stringify({ consent: "unknown", timestamp: NOW, version: 1 })
    );
    expect(getConsentStatus()).toBe("pending");
  });
});
