import React from "react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { AppChrome } from "../app-chrome";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/components/wallet-provider", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-wallet-provider">{children}</div>
  ),
}));

vi.mock("@/contexts/HelpContext", () => ({
  HelpProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-help-provider">{children}</div>
  ),
}));

vi.mock("@/contexts/FeatureFlagContext", () => ({
  FeatureFlagProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-feature-flag-provider">{children}</div>
  ),
}));

vi.mock("@/components/FeatureFlagPanel", () => ({
  FeatureFlagPanel: () => <div data-testid="mock-feature-flag-panel" />,
}));

vi.mock("@/components/status-banner", () => ({
  StatusBanner: () => <div data-testid="mock-status-banner" />,
}));

vi.mock("@/components/navbar", () => ({
  default: () => <nav data-testid="mock-navbar">Navbar</nav>,
}));

vi.mock("@/components/footer", () => ({
  default: () => <footer data-testid="mock-footer">Footer</footer>,
}));

vi.mock("@/components/service-worker-registrar", () => ({
  ServiceWorkerRegistrar: () => <div data-testid="mock-service-worker-registrar" />,
}));

vi.mock("@/components/offline-banner", () => ({
  OfflineBanner: () => <div data-testid="mock-offline-banner" />,
}));

describe("AppChrome", () => {
  const mockUsePathname = vi.mocked(usePathname);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Standard routes (full chrome)", () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue("/");
    });

    it("renders children inside main content area", () => {
      render(
        <AppChrome>
          <div data-testid="test-child">Hello Tulpar</div>
        </AppChrome>
      );

      const child = screen.getByTestId("test-child");
      expect(child).toBeInTheDocument();
      expect(child).toHaveTextContent("Hello Tulpar");

      const main = screen.getByRole("main");
      expect(main).toContainElement(child);
      expect(main).toHaveAttribute("id", "main-content");
      expect(main).toHaveAttribute("tabIndex", "-1");
    });

    it("wraps children with FeatureFlagProvider, WalletProvider, and HelpProvider", () => {
      render(
        <AppChrome>
          <span>Child Content</span>
        </AppChrome>
      );

      const featureFlagProvider = screen.getByTestId("mock-feature-flag-provider");
      const walletProvider = screen.getByTestId("mock-wallet-provider");
      const helpProvider = screen.getByTestId("mock-help-provider");

      expect(featureFlagProvider).toBeInTheDocument();
      expect(walletProvider).toBeInTheDocument();
      expect(helpProvider).toBeInTheDocument();

      // Verify hierarchy: FeatureFlagProvider -> WalletProvider -> HelpProvider
      expect(featureFlagProvider).toContainElement(walletProvider);
      expect(walletProvider).toContainElement(helpProvider);
    });

    it("renders navigation, footer, banners, and support components", () => {
      render(
        <AppChrome>
          <div>Page Body</div>
        </AppChrome>
      );

      expect(screen.getByTestId("mock-status-banner")).toBeInTheDocument();
      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
      expect(screen.getByTestId("mock-footer")).toBeInTheDocument();
      expect(screen.getByTestId("mock-feature-flag-panel")).toBeInTheDocument();
      expect(screen.getByTestId("mock-service-worker-registrar")).toBeInTheDocument();
      expect(screen.getByTestId("mock-offline-banner")).toBeInTheDocument();
    });

    it("renders an accessible skip-to-content link pointing to #main-content", () => {
      render(
        <AppChrome>
          <div>Main Page</div>
        </AppChrome>
      );

      const skipLink = screen.getByRole("link", { name: /skip to main content/i });
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute("href", "#main-content");
      expect(skipLink).toHaveClass("sr-only");
    });

    it("renders on other standard application routes", () => {
      mockUsePathname.mockReturnValue("/bridge");
      const { rerender } = render(
        <AppChrome>
          <div>Bridge Page</div>
        </AppChrome>
      );

      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
      expect(screen.getByTestId("mock-footer")).toBeInTheDocument();

      mockUsePathname.mockReturnValue("/onramp");
      rerender(
        <AppChrome>
          <div>Onramp Page</div>
        </AppChrome>
      );

      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
      expect(screen.getByTestId("mock-footer")).toBeInTheDocument();
    });
  });

  describe("Widget routes (standalone embed bypass)", () => {
    it("renders bare children without chrome when pathname is exactly /widget", () => {
      mockUsePathname.mockReturnValue("/widget");

      render(
        <AppChrome>
          <div data-testid="widget-content">Widget Form</div>
        </AppChrome>
      );

      expect(screen.getByTestId("widget-content")).toBeInTheDocument();

      // Ensure no chrome or providers are rendered
      expect(screen.queryByTestId("mock-navbar")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-footer")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-status-banner")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-offline-banner")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-feature-flag-panel")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-service-worker-registrar")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-wallet-provider")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-help-provider")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-feature-flag-provider")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /skip to main content/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("main")).not.toBeInTheDocument();
    });

    it("renders bare children when pathname is a subpath under /widget/", () => {
      mockUsePathname.mockReturnValue("/widget/embed");

      render(
        <AppChrome>
          <div data-testid="embed-child">Embedded View</div>
        </AppChrome>
      );

      expect(screen.getByTestId("embed-child")).toBeInTheDocument();
      expect(screen.queryByTestId("mock-navbar")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mock-footer")).not.toBeInTheDocument();
      expect(screen.queryByRole("main")).not.toBeInTheDocument();
    });

    it("renders bare children when pathname includes query parameters under /widget", () => {
      mockUsePathname.mockReturnValue("/widget?theme=dark&network=testnet");

      render(
        <AppChrome>
          <div data-testid="themed-widget">Themed Widget</div>
        </AppChrome>
      );

      expect(screen.getByTestId("themed-widget")).toBeInTheDocument();
      expect(screen.queryByTestId("mock-navbar")).not.toBeInTheDocument();
    });
  });

  describe("Edge cases and pathname fallbacks", () => {
    it("safely renders full chrome when pathname is null", () => {
      mockUsePathname.mockReturnValue(null);

      render(
        <AppChrome>
          <div data-testid="null-pathname-child">Fallback View</div>
        </AppChrome>
      );

      expect(screen.getByTestId("null-pathname-child")).toBeInTheDocument();
      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
      expect(screen.getByTestId("mock-footer")).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    it("safely renders full chrome when pathname is undefined", () => {
      mockUsePathname.mockReturnValue(undefined as unknown as string);

      render(
        <AppChrome>
          <div data-testid="undefined-child">Content</div>
        </AppChrome>
      );

      expect(screen.getByTestId("undefined-child")).toBeInTheDocument();
      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
    });

    it("safely renders full chrome when pathname is an empty string", () => {
      mockUsePathname.mockReturnValue("");

      render(
        <AppChrome>
          <div data-testid="empty-string-child">Content</div>
        </AppChrome>
      );

      expect(screen.getByTestId("empty-string-child")).toBeInTheDocument();
      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
    });

    it("renders full chrome when /widget appears later in the path but does not start with /widget", () => {
      mockUsePathname.mockReturnValue("/dashboard/widget");

      render(
        <AppChrome>
          <div data-testid="dashboard-child">Dashboard Content</div>
        </AppChrome>
      );

      expect(screen.getByTestId("dashboard-child")).toBeInTheDocument();
      expect(screen.getByTestId("mock-navbar")).toBeInTheDocument();
      expect(screen.getByTestId("mock-footer")).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    it("renders multiple children and fragments correctly", () => {
      mockUsePathname.mockReturnValue("/");

      render(
        <AppChrome>
          <header data-testid="child-1">Header Section</header>
          <section data-testid="child-2">Main Section</section>
        </AppChrome>
      );

      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
      const main = screen.getByRole("main");
      expect(main).toContainElement(screen.getByTestId("child-1"));
      expect(main).toContainElement(screen.getByTestId("child-2"));
    });
  });
});
