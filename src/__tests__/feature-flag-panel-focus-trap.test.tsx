// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { FeatureFlagPanel } from "@/components/FeatureFlagPanel";
import { FeatureFlagProvider } from "@/contexts/FeatureFlagContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FeatureFlagPanel Tab focus trap", () => {
  const originalEnv = process.env;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "development" };
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("wraps Tab from the last focusable element to the first", async () => {
    await act(async () => {
      root?.render(
        <FeatureFlagProvider>
          <FeatureFlagPanel />
        </FeatureFlagProvider>
      );
    });

    const toggleButton = container?.querySelector(
      'button[aria-label="Toggle feature flags panel"]'
    ) as HTMLButtonElement;
    await act(async () => {
      toggleButton.click();
    });

    const switches = container?.querySelectorAll('[role="switch"]');
    expect(switches?.length).toBeGreaterThan(0);
    const first = switches?.[0] as HTMLElement;
    const last = switches?.[switches.length - 1] as HTMLElement;

    last.focus();
    expect(document.activeElement).toBe(last);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable element to the last", async () => {
    await act(async () => {
      root?.render(
        <FeatureFlagProvider>
          <FeatureFlagPanel />
        </FeatureFlagProvider>
      );
    });

    const toggleButton = container?.querySelector(
      'button[aria-label="Toggle feature flags panel"]'
    ) as HTMLButtonElement;
    await act(async () => {
      toggleButton.click();
    });

    const switches = container?.querySelectorAll('[role="switch"]');
    const first = switches?.[0] as HTMLElement;
    const last = switches?.[switches.length - 1] as HTMLElement;

    first.focus();
    expect(document.activeElement).toBe(first);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    });

    expect(document.activeElement).toBe(last);
  });
});
