"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getConsentStatus,
  setConsentStatus,
  isFirstVisit,
  isTelemetryEnabled,
  type TelemetryConsent,
  captureEvent,
} from "@/lib/telemetry";

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
  const [consent, setConsentState] = useState<TelemetryConsent>("pending");
  const [isFirstVisitState, setIsFirstVisitState] = useState(true);
  const [isEnabledState, setIsEnabledState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Only run on client
    const state = getConsentStatus();
    const firstVisit = isFirstVisit();
    const enabled = isTelemetryEnabled();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsentState(state);
    setIsFirstVisitState(firstVisit);
    setIsEnabledState(enabled);
    setIsHydrated(true);
  }, []);

  const handleSetConsent = (newConsent: TelemetryConsent) => {
    setConsentStatus(newConsent);
    setConsentState(newConsent);
    setIsEnabledState(newConsent === "granted");

    // Capture consent event
    if (newConsent !== "pending") {
      captureEvent("telemetry_consent_changed", { consent: newConsent });
    }
  };

  const value: TelemetryContextType = {
    consent,
    setConsent: handleSetConsent,
    isFirstVisit: isFirstVisitState,
    isEnabled: isEnabledState,
    captureEvent,
  };

  // Don't render children until hydrated to avoid hydration mismatch
  if (!isHydrated) {
    return <>{children}</>;
  }

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry() {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error("useTelemetry must be used within TelemetryProvider");
  }
  return context;
}
