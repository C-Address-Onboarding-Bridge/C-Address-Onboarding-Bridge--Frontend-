import { describe, it, expect } from 'vitest';
import {
  getTranslations,
  t,
  detectLocale,
  formatNumber,
  formatCurrency,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type Locale,
} from '../i18n';

describe('Localization (#361)', () => {
  describe('getTranslations', () => {
    it.each(SUPPORTED_LOCALES)('returns translations for %s', (locale) => {
      const trans = getTranslations(locale);
      expect(trans.common.connect_wallet).toBeTruthy();
      expect(trans.bridge.title).toBeTruthy();
      expect(trans.onboarding.welcome).toBeTruthy();
      expect(trans.errors.wallet_not_found).toBeTruthy();
    });

    it('falls back to default for unknown locale', () => {
      const trans = getTranslations('xx' as Locale);
      expect(trans).toEqual(getTranslations(DEFAULT_LOCALE));
    });
  });

  describe('t() dot-path lookup', () => {
    it('resolves nested keys', () => {
      expect(t('en', 'common.connect_wallet')).toBe('Connect Wallet');
      expect(t('es', 'common.connect_wallet')).toBe('Conectar Billetera');
      expect(t('fr', 'common.connect_wallet')).toBe('Connecter le Portefeuille');
      expect(t('pt', 'common.connect_wallet')).toBe('Conectar Carteira');
    });

    it('falls back to key for missing translations', () => {
      expect(t('en', 'nonexistent.key')).toBe('nonexistent.key');
    });

    it('resolves error messages', () => {
      expect(t('en', 'errors.wallet_not_found')).toContain('Stellar wallet');
      expect(t('es', 'errors.wallet_not_found')).toContain('Stellar');
    });
  });

  describe('every locale has complete translations', () => {
    const enKeys = getAllKeys(getTranslations('en'));

    it.each(SUPPORTED_LOCALES)('%s has all translation keys', (locale) => {
      const localeKeys = getAllKeys(getTranslations(locale));
      for (const key of enKeys) {
        expect(localeKeys).toContain(key);
      }
    });

    it.each(SUPPORTED_LOCALES)('%s has no empty translation values', (locale) => {
      const trans = getTranslations(locale);
      const values = getAllValues(trans);
      for (const val of values) {
        expect(val.length).toBeGreaterThan(0);
      }
    });
  });

  describe('formatNumber', () => {
    it('formats numbers by locale', () => {
      expect(formatNumber(1234.5, 'en')).toContain('1');
      expect(formatNumber(1234.5, 'fr')).toBeTruthy();
    });
  });

  describe('formatCurrency', () => {
    it('formats currency by locale', () => {
      const en = formatCurrency(1000, 'USD', 'en');
      expect(en).toContain('1,000');
      expect(en).toContain('$');
    });
  });

  describe('detectLocale', () => {
    it('returns default when navigator unavailable', () => {
      expect(detectLocale()).toBe(DEFAULT_LOCALE);
    });
  });
});

// Typed `object`, not `Record<string, unknown>`: `TranslationSet` declares named
// fields and no index signature, so it is not assignable to a Record and the
// call sites below would not typecheck.
function getAllKeys(obj: object, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      keys.push(...getAllKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function getAllValues(obj: object): string[] {
  const values: string[] = [];
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      values.push(...getAllValues(v));
    } else if (typeof v === 'string') {
      values.push(v);
    }
  }
  return values;
}
