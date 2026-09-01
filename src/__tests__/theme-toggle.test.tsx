// @vitest-environment jsdom
/**
 * Tests for the ThemeContext and ThemeToggle UI (#461).
 *
 * Covers:
 * - Default theme resolution (stored value → OS pref → dark fallback)
 * - Toggling between light and dark
 * - localStorage persistence
 * - .dark class toggled on <html>
 * - Accessible aria-label changes with theme state
 * - Graceful fallback when ThemeProvider is absent
 * - Storage failure tolerance
 */

import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from "@/contexts/ThemeContext";

// Set React act environment flag for jsdom test runner
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement window.matchMedia. Provide a minimal stub so the
// ThemeContext effects don't throw, but individual tests can override it.
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A simple consumer that renders the theme and provides interaction buttons. */
function ThemeConsumer() {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme} data-testid="toggle">
        Toggle
      </button>
      <button onClick={() => setTheme("light")} data-testid="set-light">
        Set Light
      </button>
      <button onClick={() => setTheme("dark")} data-testid="set-dark">
        Set Dark
      </button>
    </div>
  );
}

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  // Default: OS does NOT prefer light (i.e. prefers dark).
  stubMatchMedia(false);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ThemeContext — initial resolution from localStorage", () => {
  it("picks up 'light' from localStorage on mount", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    await act(async () => {
      renderWithTheme();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("picks up 'dark' from localStorage on mount", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    await act(async () => {
      renderWithTheme();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("ThemeContext — OS preference fallback", () => {
  it("resolves to 'dark' when no stored value and OS prefers dark", async () => {
    stubMatchMedia(false); // prefers-color-scheme: light → false → prefers dark

    await act(async () => {
      renderWithTheme();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });

  it("resolves to 'light' when no stored value and OS prefers light", async () => {
    stubMatchMedia(true); // prefers-color-scheme: light → true

    await act(async () => {
      renderWithTheme();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
  });

  it("ignores an invalid stored value and uses OS preference", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "blueberry");
    stubMatchMedia(true); // OS prefers light

    await act(async () => {
      renderWithTheme();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
  });
});

describe("ThemeContext — toggling", () => {
  it("toggles from dark to light", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    await act(async () => {
      renderWithTheme();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle"));
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggles from light to dark", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    await act(async () => {
      renderWithTheme();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("light");

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle"));
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists the new theme to localStorage after toggle", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    await act(async () => {
      renderWithTheme();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle"));
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

describe("ThemeContext — setTheme", () => {
  it("sets theme to light explicitly", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    await act(async () => {
      renderWithTheme();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("set-light"));
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("sets theme to dark explicitly", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    await act(async () => {
      renderWithTheme();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("set-dark"));
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("ThemeContext — storage failure tolerance", () => {
  it("does not throw when localStorage.setItem fails", async () => {
    // Start with a valid stored value so the theme resolves without matchMedia.
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    await act(async () => {
      renderWithTheme();
    });

    // Toggling should not throw even though storage is broken.
    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle"));
    });

    // In-memory state still updated even though persistence failed.
    expect(screen.getByTestId("theme-value").textContent).toBe("light");

    vi.restoreAllMocks();
  });
});

describe("ThemeContext — useTheme outside provider", () => {
  it("returns a graceful fallback when used outside ThemeProvider", async () => {
    await act(async () => {
      render(<ThemeConsumer />);
    });

    // Fallback is 'dark' and no-ops on toggle.
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");

    // Clicking toggle should not throw.
    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle"));
    });
  });
});

// ---------------------------------------------------------------------------
// ThemeToggle button (aria-label and icon semantics)
// ---------------------------------------------------------------------------

describe("ThemeToggle button", () => {
  it("shows 'sun' label when theme is dark (indicating switch to light)", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    function ToggleOnly() {
      const { theme, toggleTheme } = useTheme();
      return (
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          data-testid="theme-btn"
        >
          {theme === "dark" ? "sun" : "moon"}
        </button>
      );
    }

    await act(async () => {
      render(
        <ThemeProvider>
          <ToggleOnly />
        </ThemeProvider>
      );
    });

    const btn = screen.getByTestId("theme-btn");
    expect(btn.textContent).toBe("sun");
    expect(btn.getAttribute("aria-label")).toBe("Switch to light theme");
  });

  it("shows 'moon' label when theme is light (indicating switch to dark)", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    function ToggleOnly() {
      const { theme, toggleTheme } = useTheme();
      return (
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          data-testid="theme-btn"
        >
          {theme === "dark" ? "sun" : "moon"}
        </button>
      );
    }

    await act(async () => {
      render(
        <ThemeProvider>
          <ToggleOnly />
        </ThemeProvider>
      );
    });

    const btn = screen.getByTestId("theme-btn");
    expect(btn.textContent).toBe("moon");
    expect(btn.getAttribute("aria-label")).toBe("Switch to dark theme");
  });

  it("updates aria-label after toggle", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    function ToggleOnly() {
      const { theme, toggleTheme } = useTheme();
      return (
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          data-testid="theme-btn"
        />
      );
    }

    await act(async () => {
      render(
        <ThemeProvider>
          <ToggleOnly />
        </ThemeProvider>
      );
    });

    const btn = screen.getByTestId("theme-btn");
    expect(btn.getAttribute("aria-label")).toBe("Switch to light theme");

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn.getAttribute("aria-label")).toBe("Switch to dark theme");
  });
});
