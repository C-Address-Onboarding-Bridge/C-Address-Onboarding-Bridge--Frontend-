// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FeatureFlagPanel } from "@/components/FeatureFlagPanel";
import { FeatureFlagProvider } from "@/contexts/FeatureFlagContext";

describe("FeatureFlagPanel Keyboard & Accessibility Flow", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "development" };
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("renders trigger button with aria-expanded false initially", () => {
    render(
      <FeatureFlagProvider>
        <FeatureFlagPanel />
      </FeatureFlagProvider>
    );

    const toggleButton = screen.getByRole("button", { name: /toggle feature flags panel/i });
    expect(toggleButton).not.toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens dialog on click and sets aria-expanded true", () => {
    render(
      <FeatureFlagProvider>
        <FeatureFlagPanel />
      </FeatureFlagProvider>
    );

    const toggleButton = screen.getByRole("button", { name: /toggle feature flags panel/i });
    fireEvent.click(toggleButton);

    expect(toggleButton.getAttribute("aria-expanded")).toBe("true");

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("feature-flags-title");
  });

  it("closes dialog and restores focus to toggle button when Escape key is pressed", () => {
    render(
      <FeatureFlagProvider>
        <FeatureFlagPanel />
      </FeatureFlagProvider>
    );

    const toggleButton = screen.getByRole("button", { name: /toggle feature flags panel/i });
    fireEvent.click(toggleButton);

    expect(screen.getByRole("dialog")).not.toBeNull();

    // Press Escape key
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggleButton);
  });

  it("does not render the panel in production even when a public token is set in localStorage", () => {
    process.env = { ...originalEnv, NODE_ENV: "production" };
    localStorage.setItem("ff_panel_token", "any-public-value");

    render(
      <FeatureFlagProvider>
        <FeatureFlagPanel />
      </FeatureFlagProvider>
    );

    expect(screen.queryByRole("button", { name: /toggle feature flags panel/i })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
