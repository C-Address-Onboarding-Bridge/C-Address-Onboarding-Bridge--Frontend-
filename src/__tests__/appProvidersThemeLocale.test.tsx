// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/components/AppProviders";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocale } from "@/contexts/LocaleContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const { theme, toggleTheme } = useTheme();
  const { locale } = useLocale();
  return (
    <button data-testid="toggle" onClick={toggleTheme}>
      {theme}:{locale}
    </button>
  );
}

describe("AppProviders mounts theme and locale providers", () => {
  it("toggling the theme changes the html dark class", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <AppProviders>
          <Probe />
        </AppProviders>
      );
    });
    const button = container.querySelector('[data-testid="toggle"]') as HTMLButtonElement;
    const before = document.documentElement.classList.contains("dark");
    act(() => button.click());
    expect(document.documentElement.classList.contains("dark")).toBe(!before);
    act(() => root.unmount());
    container.remove();
  });
});
