// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import Footer from "@/components/footer";

/**
 * Footer unit tests.
 *
 * This file also absorbed the cases that used to live in a second suite named
 * `Footer.test.tsx`. Two files whose names differed only in case sat side by
 * side in this directory, which fails `tsc --noEmit` outright (TS1149) and
 * resolves to a single file on case-insensitive checkouts. Routing coverage
 * stays in `footer-routing.test.tsx`.
 *
 * `next/navigation` has to be mocked: `<Footer>` renders `PrefetchLink`, which
 * calls `useRouter()` and throws "invariant expected app router to be mounted"
 * outside a Next app tree.
 */

// Set React act environment flag for jsdom test runner
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("Footer", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

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
  });

  const renderFooter = async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<Footer />);
    });
  };

  const anchors = () => Array.from(container?.querySelectorAll("a") ?? []);

  it("renders a single footer landmark", async () => {
    await renderFooter();

    expect(container?.querySelectorAll("footer")).toHaveLength(1);
  });

  it("renders the brand name and tagline", async () => {
    await renderFooter();

    expect(container?.textContent).toContain("C-Address Bridge");
    expect(container?.textContent).toContain("Soroban dApps");
  });

  it("renders the documented protocol links", async () => {
    await renderFooter();

    const linkHref = (name: string) =>
      anchors().find((a) => a.textContent === name)?.getAttribute("href");

    expect(linkHref("G → C Bridge")).toBe("/bridge");
    expect(linkHref("Fiat Onramp")).toBe("/onramp");
    expect(linkHref("CEX Withdrawal")).toBe("/cex");
  });

  it("links each internal protocol route to its page", async () => {
    await renderFooter();

    const hrefs = anchors().map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/bridge", "/onramp", "/cex"]));
  });

  it("renders external resource links with safe target/rel attributes", async () => {
    await renderFooter();

    const externalLinks = anchors().filter((a) =>
      ["Soroban Docs", "GitHub", "Stellar"].includes(a.textContent ?? "")
    );

    expect(externalLinks).toHaveLength(3);
    externalLinks.forEach((link) => {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    });
  });

  it("opens every external link in a new tab without leaking window.opener", async () => {
    await renderFooter();

    const externalLinks = anchors().filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("http")
    );

    expect(externalLinks.length).toBeGreaterThan(0);
    for (const link of externalLinks) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
  });
});
