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
export const TELEMETRY_EVENTS_KEY = "telemetry:events";

const MAX_BUFFERED_EVENTS = 100;

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

export interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp: number;
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
      clearBufferedEvents();
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
    store.removeItem(TELEMETRY_EVENTS_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Read the buffered telemetry events. Returns an empty array when storage is
 * unavailable or the buffer is corrupt.
 */
export function getBufferedEvents(): TelemetryEvent[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw = store.getItem(TELEMETRY_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

function clearBufferedEvents(): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(TELEMETRY_EVENTS_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Forward an event to the configured sink. The sink is resolved from
 * `window.__telemetry` when present, otherwise events are buffered locally so
 * that consent-granted telemetry is actually collected.
 */
function forwardEvent(event: TelemetryEvent): void {
  if (typeof window !== "undefined") {
    const telemetry = (window as unknown as Record<string, unknown>).__telemetry as
      | { captureEvent?: (name: string, props?: Record<string, unknown>) => void }
      | undefined;
    if (telemetry && typeof telemetry.captureEvent === "function") {
      telemetry.captureEvent(event.name, event.properties);
      return;
    }
  }

  const store = storage();
  if (!store) return;

  try {
    const events = getBufferedEvents();
    events.push(event);
    const trimmed = events.slice(-MAX_BUFFERED_EVENTS);
    store.setItem(TELEMETRY_EVENTS_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota or privacy-mode failure
  }
}

export function captureEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  // Consent-gated: only collect when the user has explicitly granted consent.
  if (getConsentStatus() !== "granted" || !isTelemetryEnabled()) {
    return;
  }

  try {
    forwardEvent({
      name: eventName,
      properties,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.debug("Failed to capture event:", error);
  }
}
