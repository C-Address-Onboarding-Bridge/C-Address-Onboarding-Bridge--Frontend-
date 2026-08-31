import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFeatureEnabled,
  fetchRemoteFlags,
  getDevOverrides,
  setDevOverride,
  clearDevOverride,
} from '../featureFlags';

const originalFetch = global.fetch;
const originalNodeEnv = process.env.NODE_ENV;

describe('featureFlags (#490)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  describe('fetchRemoteFlags fallback path', () => {
    it('falls back to a safe (disabled) definition when the backend is unreachable and there is no cache', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      const flags = await fetchRemoteFlags();
      expect(flags.every((f) => f.defaultEnabled === false && f.rolloutPercentage === 0)).toBe(true);
    });

    it('falls back to the last cached response when the backend is unreachable', async () => {
      const cached = [
        { key: 'new_onboarding_flow', name: 'x', description: 'x', defaultEnabled: true, rolloutPercentage: 100 },
      ];
      window.localStorage.setItem('ff_remote_cache', JSON.stringify(cached));

      global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      const flags = await fetchRemoteFlags();
      expect(flags).toEqual(cached);
    });

    it('caches a successful response for future fallback', async () => {
      const served = [
        { key: 'new_onboarding_flow', name: 'x', description: 'x', defaultEnabled: false, rolloutPercentage: 50 },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => served,
      });
      await fetchRemoteFlags();
      expect(JSON.parse(window.localStorage.getItem('ff_remote_cache')!)).toEqual(served);
    });
  });

  describe('isFeatureEnabled targeting', () => {
    it('is deterministic for the same session id', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { key: 'rollout_flag', name: 'x', description: 'x', defaultEnabled: false, rolloutPercentage: 50 },
        ],
      });
      await fetchRemoteFlags();
      const first = isFeatureEnabled('rollout_flag', 'user-123');
      const second = isFeatureEnabled('rollout_flag', 'user-123');
      expect(first).toBe(second);
    });

    it('a 100% rollout is enabled for every user', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { key: 'full_rollout', name: 'x', description: 'x', defaultEnabled: false, rolloutPercentage: 100 },
        ],
      });
      await fetchRemoteFlags();
      expect(isFeatureEnabled('full_rollout', 'any-user')).toBe(true);
    });

    it('defaults to disabled for an unknown flag', () => {
      expect(isFeatureEnabled('does_not_exist', 'user-1')).toBe(false);
    });
  });

  describe('dev overrides', () => {
    it('only persist in development', () => {
      process.env.NODE_ENV = 'production';
      setDevOverride('some_flag', true);
      expect(getDevOverrides()).toEqual({});
    });

    it('round-trip in development', () => {
      process.env.NODE_ENV = 'development';
      setDevOverride('some_flag', true);
      expect(getDevOverrides()).toEqual({ some_flag: true });
      clearDevOverride('some_flag');
      expect(getDevOverrides()).toEqual({});
    });

    it('degrades to {} for a corrupt stored value', () => {
      window.localStorage.setItem('ff_dev_overrides', '"not an object"');
      expect(getDevOverrides()).toEqual({});
    });
  });
});
