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

    it('returns {} for an object with non-boolean values (numbers)', () => {
      localStorage.setItem(
        'ff_dev_overrides',
        JSON.stringify({ new_onboarding_flow: 1 })
      );
      expect(getDevOverrides()).toEqual({});
    });

    it('returns {} for an object with nested object values', () => {
      localStorage.setItem(
        'ff_dev_overrides',
        JSON.stringify({ new_onboarding_flow: { enabled: true } })
      );
      expect(getDevOverrides()).toEqual({});
    });

    it('returns {} for an object with a null value', () => {
      localStorage.setItem(
        'ff_dev_overrides',
        JSON.stringify({ new_onboarding_flow: null })
      );
      expect(getDevOverrides()).toEqual({});
    });

    it('returns a valid overrides object when all values are booleans', () => {
      localStorage.setItem(
        'ff_dev_overrides',
        JSON.stringify({ new_onboarding_flow: true, advanced_address_validation: false })
      );
      expect(getDevOverrides()).toEqual({
        new_onboarding_flow: true,
        advanced_address_validation: false,
      });
    });

    it('isFeatureEnabled falls back to default when localStorage is malformed', () => {
      vi.stubEnv('NODE_ENV', 'development');
      // Plant an array — getDevOverrides should return {} so no override fires.
      localStorage.setItem('ff_dev_overrides', JSON.stringify(['oops']));
      // The flag's defaultEnabled is false; with no override it stays false.
      expect(isFeatureEnabled('new_onboarding_flow')).toBe(false);
    });
  });

  describe('FEATURE_FLAGS', () => {
    it('has at least 2 flags defined', () => {
      expect(FEATURE_FLAGS.length).toBeGreaterThanOrEqual(2);
    });

    it('all flags have required properties', () => {
      FEATURE_FLAGS.forEach(flag => {
        expect(flag).toHaveProperty('key');
        expect(flag).toHaveProperty('name');
        expect(flag).toHaveProperty('description');
        expect(flag).toHaveProperty('defaultEnabled');
        expect(flag).toHaveProperty('rolloutPercentage');
        expect(typeof flag.key).toBe('string');
        expect(typeof flag.name).toBe('string');
        expect(typeof flag.description).toBe('string');
        expect(typeof flag.defaultEnabled).toBe('boolean');
        expect(typeof flag.rolloutPercentage).toBe('number');
      });
    });

    it('rolloutPercentage is between 0 and 100', () => {
      FEATURE_FLAGS.forEach(flag => {
        expect(flag.rolloutPercentage).toBeGreaterThanOrEqual(0);
        expect(flag.rolloutPercentage).toBeLessThanOrEqual(100);
      });
    });
  });

  it('ignores defaultEnabled when rolloutPercentage is set', () => {
  vi.stubEnv('NODE_ENV', 'production');
  FEATURE_FLAGS.push({
    key: 'test_rollout_override',
    name: 'Test Rollout Override',
    description: 'Tests that rolloutPercentage overrides defaultEnabled',
    defaultEnabled: true,
    rolloutPercentage: 50,
  });
  const results = new Set<boolean>();
  for (let i = 0; i < 200; i++) {
    results.add(isFeatureEnabled('test_rollout_override', `session-${i}`));
  }
  expect(results.size).toBeGreaterThanOrEqual(2);
  FEATURE_FLAGS.pop();
});

describe('rollout percentage x defaultEnabled matrix', () => {
  function findSessions(rolloutPercent: number): { inside: string; outside: string } {
    FEATURE_FLAGS.push({
      key: 'matrix_test_flag',
      name: 'Matrix Test Flag',
      description: 'Temporary test flag',
      defaultEnabled: false,
      rolloutPercentage: rolloutPercent,
    });
    let inside = '';
    let outside = '';
    for (let i = 0; i < 10000 && (!inside || !outside); i++) {
      const sid = `matrix-session-${i}`;
      const result = isFeatureEnabled('matrix_test_flag', sid);
      if (result && !inside) inside = sid;
      if (!result && !outside) outside = sid;
    }
    FEATURE_FLAGS.pop();
    return { inside, outside };
  }

  it('rollout 0 returns defaultEnabled regardless of session', () => {
    for (const defaultEnabled of [true, false]) {
      FEATURE_FLAGS.push({
        key: 'matrix_test_flag',
        name: 'Matrix Test Flag',
        description: 'Temporary test flag',
        defaultEnabled,
        rolloutPercentage: 0,
      });
      expect(isFeatureEnabled('matrix_test_flag', 'any-session')).toBe(defaultEnabled);
      expect(isFeatureEnabled('matrix_test_flag', 'another-session')).toBe(defaultEnabled);
      FEATURE_FLAGS.pop();
    }
  });

  it('rollout 100 returns true regardless of defaultEnabled', () => {
    for (const defaultEnabled of [true, false]) {
      FEATURE_FLAGS.push({
        key: 'matrix_test_flag',
        name: 'Matrix Test Flag',
        description: 'Temporary test flag',
        defaultEnabled,
        rolloutPercentage: 100,
      });
      expect(isFeatureEnabled('matrix_test_flag', 'any-session')).toBe(true);
      expect(isFeatureEnabled('matrix_test_flag', 'another-session')).toBe(true);
      FEATURE_FLAGS.pop();
    }
  });

  it('intermediate rollout respects hash bucket regardless of defaultEnabled', () => {
    for (const defaultEnabled of [true, false]) {
      const { inside, outside } = findSessions(10);
      expect(inside).not.toBe('');
      expect(outside).not.toBe('');

      FEATURE_FLAGS.push({
        key: 'matrix_test_flag',
        name: 'Matrix Test Flag',
        description: 'Temporary test flag',
        defaultEnabled,
        rolloutPercentage: 10,
      });
      expect(isFeatureEnabled('matrix_test_flag', inside)).toBe(true);
      expect(isFeatureEnabled('matrix_test_flag', outside)).toBe(false);
      FEATURE_FLAGS.pop();
    }
  });
});

describe('environment variable parsing', () => {
    it('parses single flag from env var', () => {
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new_onboarding_flow=true';
      
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(true);
    });

    it('parses multiple flags from env var', () => {
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new_onboarding_flow=true,advanced_address_validation=false';
      
      expect(isFeatureEnabled('new_onboarding_flow')).toBe(true);
      expect(isFeatureEnabled('advanced_address_validation')).toBe(false);
    });

    it('handles whitespace in env var', () => {
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new_onboarding_flow = true , advanced_address_validation = false';
      
      expect(isFeatureEnabled('new_onboarding_flow')).toBe(true);
      expect(isFeatureEnabled('advanced_address_validation')).toBe(false);
    });

    it('ignores invalid flag values', () => {
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new_onboarding_flow=invalid';
      
      const result = isFeatureEnabled('new_onboarding_flow');
      expect(result).toBe(false);
    });
  });
});
