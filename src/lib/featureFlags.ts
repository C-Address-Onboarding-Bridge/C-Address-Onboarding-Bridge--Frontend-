export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  rolloutPercentage: number; // 0-100
}

/**
- Define all feature flags here.
- Add new features behind flags in this list.
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
  {
    key: 'locked_transfers',
    name: 'Locked Transfers & Claims',
    description:
      'Timelocked funding (#467) and its claims panel — off until the /locks API in src/lib/api.ts is backed by a real route (#672)',
    defaultEnabled: false,
    rolloutPercentage: 0,
  },
];

const FLAGS_ENDPOINT = '/api/feature-flags';
const REMOTE_CACHE_KEY = 'ff_remote_cache';
const REMOTE_FETCH_TIMEOUT_MS = 3000;
const BUCKET_ID_KEY = 'ff_bucket_id';

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

  const id = sessionId ?? getBucketId();
  const bucket = deterministicHash(`${normalizedKey}:${id}`) % 100;
  return bucket < flag.rolloutPercentage;
}

function deterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const memoryBucketId = Math.random().toString(36).slice(2);

function getBucketId(): string {
  if (typeof window === 'undefined') return 'server';

  try {
    let id = window.localStorage.getItem(BUCKET_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2);
      window.localStorage.setItem(BUCKET_ID_KEY, id);
    }
    return id;
  } catch {
    return memoryBucketId;
  }
}

/**
- Whether the developer feature-flag panel may be rendered.
- Strictly gated on `NODE_ENV === 'development'` and never trusts a client-side
- `localStorage` token. (#706, #949)
 */
export function isFeatureFlagPanelEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

const DEV_OVERRIDES_KEY = 'ff_dev_overrides';

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

export function clearDevOverride(key: string): void {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
  try {
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    const overrides = getDevOverrides();
    delete overrides[normalizedKey];
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(DEV_OVERRIDES_KEY);
      return;
    }
    window.localStorage.setItem(DEV_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

function parseEnvFlags(): Record<string, boolean> {
  const raw = process.env.NEXT_PUBLIC_FEATURE_FLAGS ?? '';
  if (!raw) return {};

  return Object.fromEntries(
    raw
      .split(',')
      .map((pair) => pair.split('='))
      .filter(([k, v]) => k && v !== undefined)
      .map(([k, v]) => [k.trim(), v.trim() === 'true'])
  );
}