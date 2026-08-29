// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import Footer from "@/components/footer";

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

// The mocked next/link stamps `data-next-link` so a test can tell a routed
// link apart from a raw <a> that would trigger a full document load.
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a data-next-link="true" {...rest}>
      {children}
    </a>
  ),
}));

describe("Footer routing", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const render = async () => {
    await act(async () => {
      root?.render(<Footer />);
    });
  };

  beforeEach(() => {
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
    vi.restoreAllMocks();
  });

  it("routes every internal destination through next/link", async () => {
    await render();

    for (const href of ["/bridge", "/onramp", "/cex"]) {
      const link = container?.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
      expect(link, `expected a footer link to ${href}`).not.toBeNull();
      expect(
        link?.getAttribute("data-next-link"),
        `${href} must use next/link — a raw <a> full-page-loads and resets wallet session state`
      ).toBe("true");
    }
  });

  it("leaves no raw same-origin anchor in the footer", async () => {
    await render();

    const rawInternal = Array.from(container?.querySelectorAll("a") ?? []).filter(
      (a) => a.getAttribute("href")?.startsWith("/") && a.getAttribute("data-next-link") !== "true"
    );

    expect(rawInternal.map((a) => a.getAttribute("href"))).toEqual([]);
  });

  it("keeps external links as plain anchors with safe rel attributes", async () => {
    await render();

    const external = Array.from(container?.querySelectorAll("a") ?? []).filter((a) =>
      a.getAttribute("href")?.startsWith("http")
    );

    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link.getAttribute("data-next-link")).toBeNull();
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });
});
