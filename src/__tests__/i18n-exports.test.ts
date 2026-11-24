import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  detectLocale,
  formatNumber,
  formatCurrency,
  DEFAULT_LOCALE,
} from '@/lib/i18n';

describe('i18n helper exports (#947)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects the first supported locale from navigator.languages', () => {
    vi.stubGlobal('navigator', {
      languages: ['de-DE', 'fr-CA', 'en-US'],
      language: 'en-US',
    });
    expect(detectLocale()).toBe('fr');
  });

  it('returns DEFAULT_LOCALE when navigator is unavailable (SSR-safe)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(detectLocale()).toBe(DEFAULT_LOCALE);
  });

  it('formats numbers and currency using Intl', () => {
    expect(formatNumber(12345.67, 'en')).toBe('12,345.67');
    expect(formatCurrency(2500, 'USD', 'en')).toContain('2,500');
  });
});