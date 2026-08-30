export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  rolloutPercentage: number; // 0-100
}

/**
 * Define all feature flags here.
 * Add new features behind flags in this list.
 */
export const FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: 'new_onboarding_flow',
    name: 'New Onboarding Flow',
    description: 'Redesigned step-by-step onboarding experience',
    defaultEnabled: false,
    rolloutPercentage: 0,
  },
  {
    key: 'advanced_address_validation',
    name: 'Advanced Address Validation',
    description: 'Enhanced address validation with real-time feedback',
    defaultEnabled: false,
    rolloutPercentage: 0,
  },
];

/**
 * Deterministic hash function for consistent rollout behavior.
 */
function deterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get or create a session ID for deterministic rollout.
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  let id = sessionStorage.getItem('ff_session_id');
  if (!id) {
    id = Math.random().toString(36).slice(2);
    sessionStorage.setItem('ff_session_id', id);
  }
  return id;
}

const DEV_OVERRIDES_KEY = 'ff_dev_overrides';

/**
 * Get all dev overrides from localStorage.
 *
 * Defensively validates the parsed value: if localStorage contains anything
 * other than a plain object whose values are all booleans (e.g. a JSON array,
 * a bare string, or an object with non-boolean values written by a third-party
 * script), the function degrades to `{}` rather than propagating unexpected
 * shapes into the feature-flag evaluation path. (#240)
 */
export function getDevOverrides(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DEV_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // Must be a plain object (not null, not array, not primitive)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    // All values must be booleans
    const obj = parsed as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      if (typeof val !== 'boolean') return {};
    }
    return obj as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * Set a dev override for a feature flag.
 *
 * Defense-in-depth: no-ops outside of the development environment regardless
 * of which call site invokes it, so callers don't need to re-add their own
 * NODE_ENV guard. (#240)
 */
export function setDevOverride(key: string, enabled: boolean): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof window === 'undefined') return;
  try {
    const overrides = getDevOverrides();
    overrides[key] = enabled;
    localStorage.setItem(DEV_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // ignore storage errors
  }
}

/**
 * Clear a dev override for a feature flag.
 *
 * Defense-in-depth: no-ops outside of the development environment regardless
 * of which call site invokes it. (#240)
 */
export function clearDevOverride(key: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof window === 'undefined') return;
  try {
    const overrides = getDevOverrides();
    delete overrides[key];
    localStorage.setItem(DEV_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // ignore storage errors
  }
}

/**
 * Parse feature flags from environment variables.
 * Format: flag1=true,flag2=false
 */
function parseEnvFlags(): Record<string, boolean> {
  const raw = process.env.NEXT_PUBLIC_FEATURE_FLAGS ?? '';
  if (!raw) return {};

  return Object.fromEntries(
    raw.split(',')
      .map(pair => pair.trim())
      .filter(pair => pair.length > 0)
      .map(pair => {
        const [k, v] = pair.split('=');
        return [k?.trim() || '', v?.trim() === 'true'] as [string, boolean];
      })
      .filter(([k]) => k.length > 0)
  );
}

/**
 * Determines if a feature flag is enabled for the current user/session.
 * Priority order:
 * 1. Developer override (localStorage) — highest priority, dev panel only
 * 2. Environment variable override (NEXT_PUBLIC_FEATURE_FLAGS)
 * 3. Rollout percentage (deterministic based on session ID)
 * 4. Default value
 */
export function isFeatureEnabled(
  key: string,
  sessionId?: string,
): boolean {
  // Find the flag definition
  const flag = FEATURE_FLAGS.find(f => f.key === key);
  if (!flag) return false;

  // 1. Developer override — highest priority (dev only)
  if (process.env.NODE_ENV === 'development') {
    const devOverrides = getDevOverrides();
    if (key in devOverrides) {
      return devOverrides[key];
    }
  }

  // 2. Environment variable override
  const envFlags = parseEnvFlags();
  if (key in envFlags) {
    return envFlags[key];
  }

  // 3. Rollout percentage (when > 0 and < 100)
  if (flag.rolloutPercentage === 100) return true;
  if (flag.rolloutPercentage === 0) return flag.defaultEnabled;

  // Deterministic hash-based rollout
  const sid = sessionId ?? getSessionId();
  const hash = deterministicHash(`${key}:${sid}`);
  const bucket = hash % 100;
  return bucket < flag.rolloutPercentage;
}
