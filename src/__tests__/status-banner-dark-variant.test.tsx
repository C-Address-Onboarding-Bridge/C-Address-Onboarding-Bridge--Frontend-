/**
 * #907 — dark: utilities must follow the app's .dark class, not the OS
 * prefers-color-scheme media query.
 *
 * Tailwind v4 defaults dark: to @media (prefers-color-scheme: dark).
 * The fix is: @custom-variant dark (&:where(.dark, .dark *)); in globals.css,
 * so the dark: classes only take effect when an ancestor has the .dark class.
 *
 * What we verify here:
 * 1. globals.css contains the @custom-variant dark declaration (static check).
 * 2. StatusBanner renders the correct paired light/dark class names so the
 *    Tailwind cascade can apply them selectively once the CSS is built.
 * 3. The banner is hidden when health is not degraded regardless of OS
 *    preference.
 *
 * Note: jsdom does not process CSS, so we can't assert which visual rules
 * "win" at runtime. The globals.css static check (test 1) is the authoritative
 * proof that the @custom-variant declaration is in place.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the hook before importing the component so the component never reaches
// api.ts (which has a pre-existing transform issue unrelated to this fix).
vi.mock("@/hooks/useHealthStatus", () => ({
  useHealthStatus: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getStatusMessage: vi.fn(() => "Service is slow"),
}));

import { useHealthStatus } from "@/hooks/useHealthStatus";
import { StatusBanner } from "@/components/status-banner";

const mockUseHealthStatus = vi.mocked(useHealthStatus);

const cssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app/globals.css",
);

describe("#907 — @custom-variant dark declaration", () => {
  it("globals.css overrides the dark: variant to follow the .dark class, not OS preference", () => {
    const css = readFileSync(cssPath, "utf8");
    // The @custom-variant dark rule must be present and point at the .dark
    // class selector (not a media query) so Tailwind v4 generates class-based
    // dark: utilities instead of media-query-based ones.
    expect(css).toMatch(/@custom-variant\s+dark\s+\(/);
    expect(css).toMatch(/\.dark/);
    // Specifically the :where(.dark, .dark *) pattern
    expect(css).toContain("@custom-variant dark (&:where(.dark, .dark *));");
  });
});

describe("#907 — StatusBanner: renders correct paired light/dark class names", () => {
  beforeEach(() => {
    mockUseHealthStatus.mockReturnValue({
      health: { status: "degraded", timestamp: null, services: {}, circuitBreakers: {} },
      isDegraded: true,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove("dark");
  });

  it("banner includes both bg-amber-50 (light) and dark:bg-amber-950 (dark) classes for degraded", () => {
    render(<StatusBanner />);
    const banner = screen.getByRole("alert");
    // Both classes must be present — the light one applies by default;
    // the dark: one activates only when an ancestor has .dark (after the fix).
    expect(banner.className).toContain("bg-amber-50");
    expect(banner.className).toContain("dark:bg-amber-950");
  });

  it("banner includes both bg-red-50 (light) and dark:bg-red-950 (dark) classes for unhealthy/error", () => {
    mockUseHealthStatus.mockReturnValue({
      health: { status: "unhealthy", timestamp: null, services: {}, circuitBreakers: {} },
      isDegraded: true,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<StatusBanner />);
    const banner = screen.getByRole("alert");
    expect(banner.className).toContain("bg-red-50");
    expect(banner.className).toContain("dark:bg-red-950");
  });

  it("is hidden when health is not degraded (regardless of OS dark preference)", () => {
    // Simulate OS dark preference
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    mockUseHealthStatus.mockReturnValue({
      health: { status: "healthy", timestamp: null, services: {}, circuitBreakers: {} },
      isDegraded: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<StatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
