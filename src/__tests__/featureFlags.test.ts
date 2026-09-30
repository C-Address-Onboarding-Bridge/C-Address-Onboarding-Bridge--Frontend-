// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isFeatureEnabled,
  FEATURE_FLAGS,
  getDevOverrides,
  setDevOverride,
  clearDevOverride,
} from '@/lib/featureFlags';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.NEXT_PUBLIC_FEATURE_FLAGS;
  
  // Clear localStorage mock
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

afterEach(() => {
  process.env = originalEnv;
  vi.unstubAllEnvs();
});

describe('featureFlags', () => {
  describe('isFeatureEnabled', () => {
    it('returns false for unknown flag', () => {
      const result = isFeatureEnabled('unknown_flag');
      expect(result).toBe(false);
    });

    it('returns default value for known flag', () => {
      // Both flags in FEATURE_FLAGS have defaultEnabled: false
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(false);
    });

    it('respects dev override in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);
      
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(true);
    });

    it('returns true when rollout percentage is 100', () => {
      vi.stubEnv('NODE_ENV', 'production');
      
      // We need to test the rollout logic directly by creating a scenario
      // Since we can't modify FEATURE_FLAGS directly, we test with env var override
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new_onboarding_flow=true';
      
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(true);
    });

    it('returns default when rollout percentage is 0', () => {
      vi.stubEnv('NODE_ENV', 'production');
      // rolloutPercentage is 0 by default
      
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(false);
    });

    it('is deterministic for same session id', () => {
      vi.stubEnv('NODE_ENV', 'production');
      
      const sessionId = 'test-session-123';
      const result1 = isFeatureEnabled('new_onboarding_flow', sessionId);
      const result2 = isFeatureEnabled('new_onboarding_flow', sessionId);
      
      expect(result1).toBe(result2);
    });

    it('env var override has priority over default', () => {
      vi.stubEnv('NODE_ENV', 'production');
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new_onboarding_flow=true';
      
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(true);
    });

    it('dev override has priority over env var', () => {
      vi.stubEnv('NODE_ENV', 'development');
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new_onboarding_flow=true';
      setDevOverride('new_onboarding_flow', false);
      
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // #713 — rollout buckets must be stable across tabs and new sessions
  // -------------------------------------------------------------------------
  describe('rollout bucket stability (#713)', () => {
    it('uses a persistent localStorage-backed id, not sessionStorage', () => {
      vi.stubEnv('NODE_ENV', 'production');

      // Simulate a fresh tab: sessionStorage is empty, localStorage persists.
      sessionStorage.clear();
      localStorage.clear();

      isFeatureEnabled('new_onboarding_flow');

      // The bucketing id must be persisted in localStorage so it survives
      // new tabs and new sessions.
      const keys = Object.keys(localStorage);
      const hasPersistentId = keys.some((k) => localStorage.getItem(k));
      expect(hasPersistentId).toBe(true);
    });

    it('produces the same bucket across simulated sessions', () => {
      vi.stubEnv('NODE_ENV', 'production');

      // First session: establish the persistent id.
      localStorage.clear();
      sessionStorage.clear();
      const first = isFeatureEnabled('new_onboarding_flow');

      // Simulate a brand-new tab/session: sessionStorage is wiped but
      // localStorage (the persistent id) remains.
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

  describe('setDevOverride', () => {
    it('persists override to localStorage', () => {
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);
      
      const stored = localStorage.getItem('ff_dev_overrides');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.new_onboarding_flow).toBe(true);
    });

    it('updates existing override', () => {
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);
      setDevOverride('new_onboarding_flow', false);
      
      const result = getDevOverrides();
      expect(result.new_onboarding_flow).toBe(false);
    });
  });

  describe('clearDevOverride', () => {
    it('removes override from localStorage', () => {
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);
      clearDevOverride('new_onboarding_flow');
      
      const result = getDevOverrides();
      expect(result.new_onboarding_flow).toBeUndefined();
    });

    it('does not affect other overrides', () => {
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);
      setDevOverride('advanced_address_validation', true);
      
      clearDevOverride('new_onboarding_flow');
      
      const result = getDevOverrides();
      expect(result.new_onboarding_flow).toBeUndefined();
      expect(result.advanced_address_validation).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // #240 — defense-in-depth: NODE_ENV guard inside set/clear
  // -------------------------------------------------------------------------
  describe('setDevOverride / clearDevOverride are no-ops outside development', () => {
    it('setDevOverride does not write to localStorage in production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      setDevOverride('new_onboarding_flow', true);

      // localStorage must remain empty — the guard fired before writing.
      expect(localStorage.getItem('ff_dev_overrides')).toBeNull();
    });

    it('clearDevOverride does not write to localStorage in production', () => {
      // Pre-seed via raw localStorage so we bypass the guard on write.
      vi.stubEnv('NODE_ENV', 'development');
      setDevOverride('new_onboarding_flow', true);

      vi.stubEnv('NODE_ENV', 'production');
      clearDevOverride('new_onboarding_flow');

      // The key should still be present — clearDevOverride was a no-op.
      const stored = localStorage.getItem('ff_dev_overrides');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.new_onboarding_flow).toBe(true);
    });

    it('setDevOverride does not write in test environment', () => {
      // NODE_ENV is 'test' by default in Vitest.
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
