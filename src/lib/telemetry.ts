/**
 * Telemetry consent and collection management.
 *
 * Manages user consent for telemetry collection with clear opt-in/out controls.
 * Ensures transparency about what is collected and how it is used.
 */

export type TelemetryConsent = "pending" | "granted" | "denied";

export const TELEMETRY_CONSENT_KEY = "telemetry:consent";
export const TELEMETRY_FIRST_VISIT_KEY = "telemetry:firstVisit";
export const TELEMETRY_STORAGE_KEY = "telemetry:enabled";

export interface TelemetryConfig {
  consent: TelemetryConsent;
  timestamp: number;
  version: number;
}

export interface TelemetryCollectionInfo {
  events: string[];
  purposes: string[];
  retention: string;
  optOut: string;
}

export const TELEMETRY_INFO: TelemetryCollectionInfo = {
  events: [
    "Page views",
    "User interactions (clicks, form submissions)",
    "Feature usage and completion",
    "Error events",
    "Performance metrics",
  ],
  purposes: [
    "Understand how users interact with the bridge",
    "Identify and fix issues",
    "Improve user experience",
    "Measure feature adoption",
  ],
  retention: "90 days",
  optOut: "You can change this decision anytime from your profile settings",
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getConsentStatus(): TelemetryConsent {
  const store = storage();
  if (!store) return "pending";

  try {
    const raw = store.getItem(TELEMETRY_CONSENT_KEY);
    if (!raw) return "pending";

    const config: TelemetryConfig = JSON.parse(raw);
    if (config.consent === "pending" || config.consent === "granted" || config.consent === "denied") {
      return config.consent;
    }
  } catch {
    // Invalid or corrupt data
  }

  return "pending";
}

export function setConsentStatus(consent: TelemetryConsent, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;

  try {
    const config: TelemetryConfig = {
      consent,
      timestamp: now,
      version: 1,
    };
    store.setItem(TELEMETRY_CONSENT_KEY, JSON.stringify(config));

    // Track if this is the first visit
    if (!store.getItem(TELEMETRY_FIRST_VISIT_KEY)) {
      store.setItem(TELEMETRY_FIRST_VISIT_KEY, String(now));
    }

    // Update enabled state based on consent
    if (consent === "granted") {
      enableTelemetry();
    } else if (consent === "denied") {
      disableTelemetry();
    }
  } catch {
    // Quota or privacy-mode failure
  }
}

export function isFirstVisit(): boolean {
  const store = storage();
  if (!store) return true;

  try {
    return !store.getItem(TELEMETRY_FIRST_VISIT_KEY);
  } catch {
    return true;
  }
}

export function isTelemetryEnabled(): boolean {
  const store = storage();
  if (!store) return false;

  try {
    const raw = store.getItem(TELEMETRY_STORAGE_KEY);
    return raw === "true";
  } catch {
    return false;
  }
}

export function enableTelemetry(): void {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(TELEMETRY_STORAGE_KEY, "true");
  } catch {
    // Quota or privacy-mode failure
  }
}

export function disableTelemetry(): void {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(TELEMETRY_STORAGE_KEY, "false");
  } catch {
    // Quota or privacy-mode failure
  }
}

export function clearTelemetryConsent(): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(TELEMETRY_CONSENT_KEY);
    store.removeItem(TELEMETRY_FIRST_VISIT_KEY);
    store.removeItem(TELEMETRY_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function captureEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  try {
    // In production, this would send to the telemetry endpoint
    // defined in the API configuration
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__telemetry) {
      const telemetry = (window as unknown as Record<string, unknown>).__telemetry as {
        captureEvent?: (name: string, props?: Record<string, unknown>) => void;
      };
      telemetry.captureEvent?.(eventName, properties);
    }
  } catch (error) {
    console.debug("Failed to capture event:", error);
  }
}
