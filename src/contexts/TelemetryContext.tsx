"use client";

import React, { createContext, useContext, useState } from "react";
import {
  getConsentStatus,
  setConsentStatus,
  isFirstVisit,
  isTelemetryEnabled,
  type TelemetryConsent,
  captureEvent,
} from "@/lib/telemetry";
import { useHydrated } from "@/hooks/useHydrated";

interface TelemetryContextType {
  consent: TelemetryConsent;
  setConsent: (consent: TelemetryConsent) => void;
  isFirstVisit: boolean;
  isEnabled: boolean;
  captureEvent: (eventName: string, properties?: Record<string, unknown>) => void;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

interface TelemetryProviderProps {
  children: React.ReactNode;
}

export function TelemetryProvider({ children }: TelemetryProviderProps) {
  const hydrated = useHydrated();
  const [consentOverride, setConsentOverride] = useState<TelemetryConsent | null>(null);
  const [firstVisitOverride, setFirstVisitOverride] = useState<boolean | null>(null);
  const consent = consentOverride ?? (hydrated ? getConsentStatus() : "pending");
  const firstVisit = firstVisitOverride ?? (hydrated ? isFirstVisit() : true);
  const enabled = consentOverride !== null
    ? consentOverride === "granted"
    : hydrated ? isTelemetryEnabled() : false;

  const handleSetConsent = (newConsent: TelemetryConsent) => {
    setConsentStatus(newConsent);
    setConsentOverride(newConsent);
    setFirstVisitOverride(false);

    // Capture consent event
    if (newConsent !== "pending") {
      captureEvent("telemetry_consent_changed", { consent: newConsent });
    }
  };

  const value: TelemetryContextType = {
    consent,
    setConsent: handleSetConsent,
    isFirstVisit: firstVisit,
    isEnabled: enabled,
    captureEvent,
  };

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry() {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error("useTelemetry must be used within TelemetryProvider");
  }
  return context;
}
