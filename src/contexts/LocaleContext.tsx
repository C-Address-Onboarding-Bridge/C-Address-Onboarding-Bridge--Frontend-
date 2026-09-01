'use client';

/**
 * Locale context for the i18n language switcher (#462).
 *
 * Design decisions:
 * - Detects the preferred locale on first visit from:
 *   1. `localStorage` (persisted user choice, key: `ui:locale`)
 *   2. `navigator.language` / `Accept-Language` equivalent in the browser
 *   3. Falls back to `DEFAULT_LOCALE` ('en')
 * - Only accepts locales present in `SUPPORTED_LOCALES`; unknown values fall
 *   back to the default so incomplete catalogs are never exposed.
 * - Storage access is guarded the same way `src/lib/session.ts` guards it,
 *   tolerating privacy modes and storage quota errors without throwing.
 * - Exposes a `t(key)` shorthand bound to the active locale so consumers
 *   don't have to thread the locale through every call-site.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getTranslations,
  t as rawT,
  detectLocale,
  type Locale,
  type TranslationSet,
} from '@/lib/i18n';

export const LOCALE_STORAGE_KEY = 'ui:locale';

// Re-export so consumers can import from a single place.
export type { Locale };
export { SUPPORTED_LOCALES, DEFAULT_LOCALE };

interface LocaleContextValue {
  /** The active locale. */
  locale: Locale;
  /** Translate a dot-path key in the active locale. Falls back to the key string. */
  t: (key: string) => string;
  /** The full translation set for the active locale (for advanced use). */
  translations: TranslationSet;
  /** Change and persist the locale. No-ops for unsupported values. */
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredLocale(): Locale | null {
  const stored = getStorage()?.getItem(LOCALE_STORAGE_KEY);
  if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
    return stored as Locale;
  }
  return null;
}

function writeStoredLocale(locale: Locale): void {
  try {
    getStorage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Quota or privacy-mode failure — in-memory state still works.
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Resolve on the client: stored choice → browser language → default.
  // Done in an effect (not lazy state init) so SSR renders the default locale
  // and the client immediately corrects it after hydration — no mismatch.
  useEffect(() => {
    const resolved = readStoredLocale() ?? detectLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(resolved);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    writeStoredLocale(next);
    setLocaleState(next);
  }, []);

  const tBound = useCallback((key: string) => rawT(locale, key), [locale]);

  const value: LocaleContextValue = {
    locale,
    t: tBound,
    translations: getTranslations(locale),
    setLocale,
  };

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Graceful fallback outside the provider (e.g. isolated unit tests).
    return {
      locale: DEFAULT_LOCALE,
      t: (key: string) => rawT(DEFAULT_LOCALE, key),
      translations: getTranslations(DEFAULT_LOCALE),
      setLocale: () => {},
    };
  }
  return ctx;
}
