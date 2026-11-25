// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isFeatureFlagPanelEnabled,
  isFeatureEnabled,
  getDevOverrides,
  setDevOverride,
  clearDevOverride,
} from '../lib/featureFlags';

describe('isFeatureFlagPanelEnabled', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // #713 — rollout buckets must be stable across tabs and new sessions
  // -------------------------------------------------------------------------
  describe('rollout bucket stability (#713)', () => {
    it('uses a persistent localStorage-backed id, not sessionStorage', () => {
      vi.stubEnv('NODE_ENV', 'production');

      sessionStorage.clear();
      localStorage.clear();

      isFeatureEnabled('new_onboarding_flow');

      const keys = Object.keys(localStorage);
      const hasPersistentId = keys.some((k) => localStorage.getItem(k));
      expect(hasPersistentId).toBe(true);
    });

    it('produces the same bucket across simulated sessions', () => {
      vi.stubEnv('NODE_ENV', 'production');

      localStorage.clear();
      sessionStorage.clear();
      const first = isFeatureEnabled('new_onboarding_flow');

      sessionStorage.clear();
      const second = isFeatureEnabled('new_onboarding_flow');

      expect(second).toBe(first);
    });

    it('is stable when an explicit wallet address is supplied', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const wallet = '0x1234567890abcdef1234567890abcdef12345678';
      const result1 = isFeatureEnabled('new_onboarding_flow', wallet);
      const result2 = isFeatureEnabled('new_onboarding_flow', wallet);

      expect(result1).toBe(result2);
    });
  });

  describe('getDevOverrides', () => {
    it('returns empty object when no overrides set', () => {
      const result = getDevOverrides();
      expect(result).toEqual({});
    });

    it('returns overrides from localStorage', () => {
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);
      setDevOverride('advanced_address_validation', false);

      const result = getDevOverrides();
      expect(result).toEqual({
        new_onboarding_flow: true,
        advanced_address_validation: false,
      });
    });
  });

  it('is enabled in non-production environments', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    expect(isFeatureFlagPanelEnabled()).toBe(true);
  });

  it('does not trust a client-side localStorage token', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    window.localStorage.setItem('ff_panel_token', 'anything');
    expect(isFeatureFlagPanelEnabled()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // #240 — defense-in-depth: NODE_ENV guard inside set/clear
  // -------------------------------------------------------------------------
  describe('setDevOverride / clearDevOverride are no-ops outside development', () => {
    it('setDevOverride does not write to localStorage in production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      setDevOverride('new_onboarding_flow', true);

      expect(localStorage.getItem('ff_dev_overrides')).toBeNull();
    });

    it('clearDevOverride does not write to localStorage in production', () => {
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);

      vi.stubEnv('NODE_ENV', 'production');
      clearDevOverride('new_onboarding_flow');

      const stored = localStorage.getItem('ff_dev_overrides');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.new_onboarding_flow).toBe(true);
    });

    it('setDevOverride does not write in test environment', () => {
      vi.stubEnv('NODE_ENV', 'test');
      setDevOverride('new_onboarding_flow', true);
      expect(localStorage.getItem('ff_dev_overrides')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // #240 — getDevOverrides: graceful degradation on malformed localStorage
  // -------------------------------------------------------------------------
  describe('getDevOverrides degrades safely on malformed localStorage content', () => {
    it('returns {} for a non-JSON string', () => {
      localStorage.setItem('ff_dev_overrides', 'this is not json!!!');
      expect(getDevOverrides()).toEqual({});
    });

    it('returns {} for a JSON array', () => {
      localStorage.setItem('ff_dev_overrides', JSON.stringify([true, false]));
      expect(getDevOverrides()).toEqual({});
    });

    it('returns {} for a JSON primitive (boolean)', () => {
      localStorage.setItem('ff_dev_overrides', 'true');
      expect(getDevOverrides()).toEqual({});
    });

    it('returns {} for a JSON primitive (number)', () => {
      localStorage.setItem('ff_dev_overrides', '42');
      expect(getDevOverrides()).toEqual({});
    });

    it('returns {} for a JSON null', () => {
      localStorage.setItem('ff_dev_overrides', 'null');
      expect(getDevOverrides()).toEqual({});
    });

    it('returns {} for an object with non-boolean values (strings)', () => {
      localStorage.setItem(
        'ff_dev_overrides',
        JSON.stringify({ new_onboarding_flow: 'yes' })
      );
      expect(getDevOverrides()).toEqual({});
    });
  });
});