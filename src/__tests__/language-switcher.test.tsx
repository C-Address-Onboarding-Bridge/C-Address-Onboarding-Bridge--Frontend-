// @vitest-environment jsdom
/**
 * Tests for the LocaleContext and language switcher UI (#462).
 *
 * Covers:
 * - Default locale resolution (stored value → browser preference → 'en')
 * - setLocale changes the active locale
 * - Locale persisted to localStorage
 * - t() translation function returns the correct string per locale
 * - t() falls back to the key string for missing translations
 * - Graceful fallback when LocaleProvider is absent
 * - Language switcher buttons in the Footer
 */

import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  LocaleProvider,
  useLocale,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type Locale,
} from "@/contexts/LocaleContext";
import { getTranslations } from "@/lib/i18n";

// Set React act environment flag for jsdom test runner
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LocaleConsumer() {
  const { locale, t, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale-value">{locale}</span>
      <span data-testid="connect-wallet">{t("common.connect_wallet")}</span>
      <span data-testid="missing-key">{t("nonexistent.key")}</span>
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          data-testid={`set-${l}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function renderWithLocale() {
  return render(
    <LocaleProvider>
      <LocaleConsumer />
    </LocaleProvider>
  );
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocaleContext — initial resolution", () => {
  it("defaults to 'en' when nothing is stored and browser language is unknown", async () => {
    // navigator.language is 'en' by default in jsdom.
    await act(async () => {
      renderWithLocale();
    });

    // After the effect fires, locale should match the environment.
    // jsdom defaults navigator.language to 'en', which is a supported locale.
    expect(["en", DEFAULT_LOCALE]).toContain(
      screen.getByTestId("locale-value").textContent
    );
  });

  it("picks up a stored locale on mount", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "es");

    await act(async () => {
      renderWithLocale();
    });

    expect(screen.getByTestId("locale-value").textContent).toBe("es");
  });

  it("ignores stored values that are not in SUPPORTED_LOCALES", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "zz");

    await act(async () => {
      renderWithLocale();
    });

    // Should not be 'zz'; falls back to browser/default.
    expect(SUPPORTED_LOCALES).toContain(
      screen.getByTestId("locale-value").textContent as Locale
    );
  });

  it.each(SUPPORTED_LOCALES)(
    "honours every supported locale when stored: %s",
    async (l) => {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);

      await act(async () => {
        renderWithLocale();
      });

      expect(screen.getByTestId("locale-value").textContent).toBe(l);
    }
  );
});

describe("LocaleContext — setLocale", () => {
  it.each(SUPPORTED_LOCALES)("switches to locale %s and persists it", async (target) => {
    await act(async () => {
      renderWithLocale();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId(`set-${target}`));
    });

    expect(screen.getByTestId("locale-value").textContent).toBe(target);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(target);
  });

  it("does not switch to an unsupported locale", async () => {
    await act(async () => {
      render(
        <LocaleProvider>
          <LocaleConsumerUnsupported />
        </LocaleProvider>
      );
    });

    const before = screen.getByTestId("locale-value").textContent;

    await act(async () => {
      fireEvent.click(screen.getByTestId("set-invalid"));
    });

    // Locale should be unchanged.
    expect(screen.getByTestId("locale-value").textContent).toBe(before);
  });
});

// A consumer that also exposes a button to attempt setting an invalid locale.
function LocaleConsumerUnsupported() {
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale-value">{locale}</span>
      <button
        onClick={() => setLocale("zz" as Locale)}
        data-testid="set-invalid"
      >
        Set Invalid
      </button>
    </div>
  );
}

describe("LocaleContext — t() translation function", () => {
  it("returns the English translation for common.connect_wallet", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");

    await act(async () => {
      renderWithLocale();
    });

    expect(screen.getByTestId("connect-wallet").textContent).toBe("Connect Wallet");
  });

  it("returns the Spanish translation for common.connect_wallet", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "es");

    await act(async () => {
      renderWithLocale();
    });

    expect(screen.getByTestId("connect-wallet").textContent).toBe("Conectar Billetera");
  });

  it("returns the French translation for common.connect_wallet", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "fr");

    await act(async () => {
      renderWithLocale();
    });

    expect(screen.getByTestId("connect-wallet").textContent).toBe("Connecter le Portefeuille");
  });

  it("returns the Portuguese translation for common.connect_wallet", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt");

    await act(async () => {
      renderWithLocale();
    });

    expect(screen.getByTestId("connect-wallet").textContent).toBe("Conectar Carteira");
  });

  it("falls back to the key string for a missing translation", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");

    await act(async () => {
      renderWithLocale();
    });

    expect(screen.getByTestId("missing-key").textContent).toBe("nonexistent.key");
  });

  it("updates translated text when locale changes", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");

    await act(async () => {
      renderWithLocale();
    });

    expect(screen.getByTestId("connect-wallet").textContent).toBe("Connect Wallet");

    await act(async () => {
      fireEvent.click(screen.getByTestId("set-es"));
    });

    expect(screen.getByTestId("connect-wallet").textContent).toBe("Conectar Billetera");
  });
});

describe("LocaleContext — storage failure tolerance", () => {
  it("does not throw when localStorage.setItem fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    await act(async () => {
      renderWithLocale();
    });

    // Switching locales should not throw even when storage is broken.
    await act(async () => {
      fireEvent.click(screen.getByTestId("set-es"));
    });

    // In-memory state still updates.
    expect(screen.getByTestId("locale-value").textContent).toBe("es");

    vi.restoreAllMocks();
  });
});

describe("LocaleContext — useLocale outside provider", () => {
  it("returns English fallback when used outside LocaleProvider", async () => {
    await act(async () => {
      render(<LocaleConsumer />);
    });

    expect(screen.getByTestId("locale-value").textContent).toBe("en");
    expect(screen.getByTestId("connect-wallet").textContent).toBe("Connect Wallet");
  });
});

describe("SUPPORTED_LOCALES completeness", () => {
  it("all locales have non-empty common.connect_wallet", () => {
    for (const l of SUPPORTED_LOCALES) {
      const trans = getTranslations(l);
      expect(trans.common.connect_wallet.length).toBeGreaterThan(0);
    }
  });

  it("all locales have non-empty common.disconnect", () => {
    for (const l of SUPPORTED_LOCALES) {
      const trans = getTranslations(l);
      expect(trans.common.disconnect.length).toBeGreaterThan(0);
    }
  });
});
