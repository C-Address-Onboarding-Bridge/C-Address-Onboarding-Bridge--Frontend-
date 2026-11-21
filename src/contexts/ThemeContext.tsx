'use client';

/**
 * Theme context for dark / light mode toggle (#461).
 *
 * Design decisions:
 * - Defaults to the OS `prefers-color-scheme` preference on first visit.
 * - Persists the explicit user choice in `localStorage` under `THEME_STORAGE_KEY`,
 *   tolerating unavailable storage the same way `src/lib/session.ts` does.
 * - Applies the active theme by toggling a `.dark` class on `<html>`. CSS custom
 *   properties live under `:root` (light) and `:root.dark` (dark) so there is a
 *   single source of truth in globals.css with no runtime style injection.
 * - A flash-prevention inline script in layout.tsx reads the persisted value
 *   before the first paint, so the class is set synchronously. This context
 *   merely syncs React state with whatever the script already applied.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useHydrated } from '@/hooks/useHydrated';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'ui:theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setSystemTheme?: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Storage helpers — mirrors the guard pattern in src/lib/session.ts
// ---------------------------------------------------------------------------

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredTheme(): Theme | null {
  const stored = getStorage()?.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return null;
}

function writeStoredTheme(theme: Theme): void {
  try {
    if (theme === 'system') {
      getStorage()?.removeItem(THEME_STORAGE_KEY);
    } else {
      getStorage()?.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Quota or privacy-mode failure: in-memory state still works.
  }
}

function resolveOsTheme(): 'light' | 'dark' {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'light';
  }
  return 'dark';
}

/** Resolve the theme from storage, then OS preference, then dark as default. */
function resolveInitialTheme(): 'light' | 'dark' {
  const stored = readStoredTheme();
  if (stored) return stored as 'light' | 'dark';
  return resolveOsTheme();
}

/** Apply/remove the `.dark` class on `<html>`. */
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const target = theme === 'system' ? resolveOsTheme() : theme;
  if (target === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const [themeOverride, setThemeState] = useState<Theme | null>(null);
  const theme = themeOverride ?? (hydrated ? resolveInitialTheme() : 'dark');

  // Hydration guard: on the client, sync with the real DOM state once (in case
  // the server rendered 'dark' as the SSR default but the script set 'light').
  useEffect(() => {
    const resolved = resolveInitialTheme();
    applyTheme(resolved);
  }, []);

  // Listen for OS preference changes so we follow them when the user has not
  // made an explicit override.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) => {
      // Only follow the OS preference if the user hasn't chosen explicitly.
      if (!readStoredTheme()) {
        const next: Theme = e.matches ? 'light' : 'dark';
        applyTheme(next);
        setThemeState(next);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Multi-tab synchronization: listen for storage events on THEME_STORAGE_KEY
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      if (e.newValue === 'light' || e.newValue === 'dark') {
        applyTheme(e.newValue);
        setThemeState(e.newValue);
      } else {
        const next = resolveOsTheme();
        applyTheme(next);
        setThemeState(next);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    if (next === 'system') {
      writeStoredTheme('system');
      const os = resolveOsTheme();
      applyTheme(os);
      setThemeState('system');
    } else {
      applyTheme(next);
      writeStoredTheme(next);
      setThemeState(next);
    }
  }, []);

  const setSystemTheme = useCallback(() => {
    setTheme('system');
  }, [setTheme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, setSystemTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Graceful fallback outside the provider (e.g. isolated unit tests).
    if (process.env.NODE_ENV === 'development') {
      console.warn('useTheme was called outside <ThemeProvider>; theme changes will be ignored.');
    }
    return { theme: 'dark', toggleTheme: () => {}, setTheme: () => {} };
  }
  return ctx;
}
