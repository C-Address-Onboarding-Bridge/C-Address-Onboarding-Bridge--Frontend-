// @vitest-environment jsdom
//
// Routing coverage for the footer, which the root layout renders on every page.
//
// The footer used to navigate its Protocol links with bare <a href="/bridge">
// anchors. Those are full document loads: the client tree is torn down, and
// because WalletProvider keeps the session in memory only (no localStorage /
// sessionStorage), a footer click dropped the connected address, the network
// status, the dismissed-mismatch flag and any half-filled bridge/onramp form.
// These tests pin the distinction so a future edit that reintroduces a raw
// anchor for an internal route fails here.
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Footer from "@/components/footer";

// next/link is stubbed with a marker attribute — without it a rendered Link and
// a raw anchor are indistinguishable in the DOM, which is exactly the bug.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className} data-next-link="true">
      {children}
    </a>
  ),
}));

const INTERNAL_ROUTES = ["/bridge", "/onramp", "/cex"];

afterEach(cleanup);

describe("Footer routing", () => {
  it("routes every internal destination through next/link", () => {
    render(<Footer />);

    for (const route of INTERNAL_ROUTES) {
      const link = document.querySelector(`a[href="${route}"]`);
      expect(link, `expected a footer link to ${route}`).not.toBeNull();
      expect(
        link?.getAttribute("data-next-link"),
        `${route} must use next/link, not a raw <a> (a raw anchor full-reloads and drops the wallet session)`
      ).toBe("true");
    }
  });

  it("leaves no same-origin anchor outside next/link", () => {
    render(<Footer />);

    const rawInternalAnchors = Array.from(document.querySelectorAll("a[href^='/']")).filter(
      (anchor) => anchor.getAttribute("data-next-link") !== "true"
    );

    expect(rawInternalAnchors.map((anchor) => anchor.getAttribute("href"))).toEqual([]);
  });

  it("keeps external resources as plain anchors that open safely", () => {
    render(<Footer />);

    const externalAnchors = Array.from(document.querySelectorAll("a[href^='http']"));
    expect(externalAnchors.length).toBeGreaterThan(0);

    for (const anchor of externalAnchors) {
      expect(anchor.getAttribute("data-next-link")).toBeNull();
      expect(anchor.getAttribute("target")).toBe("_blank");
      // noopener/noreferrer keep the opened tab from reaching window.opener.
      expect(anchor.getAttribute("rel")).toContain("noopener");
      expect(anchor.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it("still renders the visible labels for each protocol route", () => {
    render(<Footer />);

    expect(screen.getByText("G → C Bridge").closest("a")?.getAttribute("href")).toBe("/bridge");
    expect(screen.getByText("Fiat Onramp").closest("a")?.getAttribute("href")).toBe("/onramp");
    expect(screen.getByText("CEX Withdrawal").closest("a")?.getAttribute("href")).toBe("/cex");
  });
});
