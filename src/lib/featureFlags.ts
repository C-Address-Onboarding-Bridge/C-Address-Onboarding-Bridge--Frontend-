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

const FLAGS_ENDPOINT = '/api/feature-flags';
const REMOTE_CACHE_KEY = 'ff_remote_cache';
const REMOTE_FETCH_TIMEOUT_MS = 3000;

let remoteFlagsMemo: FeatureFlag[] | null = null;

function readCachedRemoteFlags(): FeatureFlag[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REMOTE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FeatureFlag[]) : null;
  } catch {
    return null;
  }
}

function writeCachedRemoteFlags(flags: FeatureFlag[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(flags));
  } catch {
    // Storage unavailable/full — cache is a best-effort convenience only.
  }
}

/**
 * Fetches flag definitions from the backend so they can be changed without a
 * client redeploy. Falls back to the last-known-good cache on failure, and
 * populates `remoteFlagsMemo` so subsequent `isFeatureEnabled` calls in this
 * session use it without refetching. Never throws — a flag source that can
 * fail must not be able to crash the app that reads it.
 */
export async function fetchRemoteFlags(): Promise<FeatureFlag[]> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timeout = controller
    ? setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS)
    : undefined;
  try {
    const res = await fetch(FLAGS_ENDPOINT, { signal: controller?.signal });
    if (!res.ok) throw new Error(`Feature flag source returned ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Feature flag source returned an unexpected shape');
    remoteFlagsMemo = data as FeatureFlag[];
    writeCachedRemoteFlags(remoteFlagsMemo);
    return remoteFlagsMemo;
  } catch {
    const cached = readCachedRemoteFlags();
    if (cached) {
      remoteFlagsMemo = cached;
      return cached;
    }
    // No remote and no cache: fail safe rather than trusting the bundled
    // defaults, since a future flag could default to enabled.
    remoteFlagsMemo = FEATURE_FLAGS.map((f) => ({ ...f, defaultEnabled: false, rolloutPercentage: 0 }));
    return remoteFlagsMemo;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getFlagDef(key: string): FeatureFlag | undefined {
  const source = remoteFlagsMemo ?? readCachedRemoteFlags();
  return (source ?? FEATURE_FLAGS).find((f) => f.key === key);
}

/**
 * Determines if a feature flag is enabled for the current user/session.
 * Priority order:
 * 1. Developer override (localStorage) — highest priority, dev panel only
 * 2. Environment variable override (NEXT_PUBLIC_FEATURE_FLAGS)
 * 3. Rollout percentage (deterministic based on the given user/session id,
 *    so the same user consistently lands on the same side of a gradual
 *    rollout instead of flipping on every evaluation)
 * 4. Default value
 *
 * Until {@link fetchRemoteFlags} has resolved at least once, definitions
 * fall back to the last cached response, then to the bundled defaults.
 */
export function isFeatureEnabled(
  key: string,
  sessionId?: string,
): boolean {
  const normalizedKey = key.trim();
  if (!normalizedKey) return false;

  if (process.env.NODE_ENV === 'development') {
    const overrides = getDevOverrides();
    if (normalizedKey in overrides) return overrides[normalizedKey];
  }

  const envFlags = parseEnvFlags();
  if (normalizedKey in envFlags) return envFlags[normalizedKey];

  const flag = getFlagDef(normalizedKey);
  if (!flag) return false;

  if (flag.rolloutPercentage <= 0) return flag.defaultEnabled;
  if (flag.rolloutPercentage >= 100) return true;

  const id = sessionId ?? getSessionId();
  const bucket = deterministicHash(`${normalizedKey}:${id}`) % 100;
  return bucket < flag.rolloutPercentage;
}

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
    const raw = window.localStorage.getItem(DEV_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !Object.values(parsed).every((v) => typeof v === 'boolean')
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([key]) => key.trim().length > 0)
    ) as Record<string, boolean>;
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
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
  try {
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    const overrides = getDevOverrides();
    overrides[normalizedKey] = enabled;
    window.localStorage.setItem(DEV_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — override simply won't persist this session.
  }
}

/**
 * Clear a dev override for a feature flag.
 *
 * Defense-in-depth: no-ops outside of the development environment regardless
 * of which call site invokes it. (#240)
 */
export function clearDevOverride(key: string): void {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
  try {
    const overrides = getDevOverrides();
    delete overrides[key];
    window.localStorage.setItem(DEV_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — nothing to clear.
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
