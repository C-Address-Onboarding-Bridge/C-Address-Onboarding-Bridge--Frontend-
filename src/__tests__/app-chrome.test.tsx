// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ pathname: "/" as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

// Every piece of chrome is replaced by a marker, so these tests cover what
// AppChrome composes and in what order, not the children's own behavior.
function marker(name: string) {
  return function Marker() {
    return <div data-testid={name} />;
  };
}
function provider(name: string) {
  return function Provider({ children }: { children: React.ReactNode }) {
    return <div data-testid={name}>{children}</div>;
  };
}

vi.mock("@/components/wallet-provider", () => ({ WalletProvider: provider("wallet-provider") }));
vi.mock("@/contexts/HelpContext", () => ({ HelpProvider: provider("help-provider") }));
vi.mock("@/contexts/FeatureFlagContext", () => ({
  FeatureFlagProvider: provider("feature-flag-provider"),
}));
vi.mock("@/components/FeatureFlagPanel", () => ({ FeatureFlagPanel: marker("feature-flag-panel") }));
vi.mock("@/components/status-banner", () => ({ StatusBanner: marker("status-banner") }));
vi.mock("@/components/navbar", () => ({ default: marker("navbar") }));
vi.mock("@/components/footer", () => ({ default: marker("footer") }));
vi.mock("@/components/service-worker-registrar", () => ({
  ServiceWorkerRegistrar: marker("service-worker-registrar"),
}));
vi.mock("@/components/offline-banner", () => ({ OfflineBanner: marker("offline-banner") }));

import { AppChrome } from "@/components/app-chrome";

const CHROME = [
  "feature-flag-provider",
  "wallet-provider",
  "help-provider",
  "status-banner",
  "navbar",
  "footer",
  "feature-flag-panel",
  "service-worker-registrar",
  "offline-banner",
];

function renderAt(pathname: string | null) {
  navigation.pathname = pathname;
  return render(
    <AppChrome>
      <p>page content</p>
    </AppChrome>
  );
}

afterEach(() => {
  cleanup();
  navigation.pathname = "/";
});

describe("AppChrome (#757)", () => {
  it("wraps a normal route in the providers, navbar, footer and banners", () => {
    renderAt("/bridge");
    for (const id of CHROME) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("nests the providers so every piece of chrome is inside all of them", () => {
    renderAt("/");
    const featureFlags = screen.getByTestId("feature-flag-provider");
    const wallet = screen.getByTestId("wallet-provider");
    const help = screen.getByTestId("help-provider");
    expect(featureFlags).toContainElement(wallet);
    expect(wallet).toContainElement(help);
    for (const id of CHROME.slice(3)) expect(help).toContainElement(screen.getByTestId(id));
  });

  it("renders the page inside the main landmark, between navbar and footer", () => {
    renderAt("/dashboard");
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(main).toContainElement(screen.getByText("page content"));
    expect(main).not.toContainElement(screen.getByTestId("navbar"));
    expect(main).not.toContainElement(screen.getByTestId("footer"));

    const navbar = screen.getByTestId("navbar");
    const footer = screen.getByTestId("footer");
    expect(navbar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts a skip link to the main content before the navbar", () => {
    renderAt("/");
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(
      skip.compareDocumentPosition(screen.getByTestId("navbar")) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it.each(["/widget", "/widget/fund", "/widget/fund/usdc"])(
    "renders only the page on the embeddable widget route %s",
    (pathname) => {
      const { container } = renderAt(pathname);
      expect(screen.getByText("page content")).toBeInTheDocument();
      for (const id of CHROME) expect(screen.queryByTestId(id)).toBeNull();
      expect(screen.queryByRole("main")).toBeNull();
      expect(container.innerHTML).toBe("<p>page content</p>");
    }
  );

  it("keeps the full chrome when the pathname is not available yet", () => {
    renderAt(null);
    for (const id of CHROME) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByText("page content"));
  });

  it("does not treat a route that merely contains /widget as the widget", () => {
    renderAt("/docs/widget");
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });
});
