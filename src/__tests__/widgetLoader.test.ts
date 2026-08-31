// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Tests for public/aframp-widget.js — the host-page loader half of the
 * embeddable widget (#558). It's plain, dependency-free JavaScript (no
 * build step, so it can't import from src/), so it's loaded and evaluated
 * here directly rather than through a bundler — the same "run the real
 * file" approach src/__tests__/serviceWorker.test.ts takes for public/sw.js,
 * except this script's APIs (DOM, postMessage) work fine under jsdom, so the
 * real mount()/message-handling behavior is exercised end to end rather than
 * just text-matched.
 */

const scriptSource = readFileSync(
  path.resolve(__dirname, "../../public/aframp-widget.js"),
  "utf8",
);

const WIDGET_ORIGIN = "https://bridge.example.com";

/**
 * Creates a mount container attached to the live document, not a detached
 * element — an iframe's `contentWindow` isn't reliably distinguishable from
 * another detached iframe's under jsdom until its container is actually in
 * the document, same as it would be on any real host page.
 */
function createContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

function loadScript(): typeof window & {
  AframpWidget: {
    mount: (container: HTMLElement, config: Record<string, unknown>) => { unmount: () => void };
    isMessageFromWidget: (event: MessageEvent, widgetOrigin: string, iframeWindow: Window | null) => boolean;
    buildWidgetUrl: (config: Record<string, unknown>) => string;
  };
} {
  (0, eval)(scriptSource);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return window as any;
}

describe("public/aframp-widget.js", () => {
  let win: ReturnType<typeof loadScript>;

  beforeEach(() => {
    // Fresh evaluation per test — the IIFE reassigns window.AframpWidget
    // each time, so no manual reset is needed between tests.
    win = loadScript();
  });

  it("exposes AframpWidget.mount on window", () => {
    expect(typeof win.AframpWidget.mount).toBe("function");
  });

  describe("buildWidgetUrl", () => {
    it("builds a /widget URL carrying the config and the host's own origin as parentOrigin", () => {
      const url = win.AframpWidget.buildWidgetUrl({
        widgetOrigin: WIDGET_ORIGIN,
        address: "CTEST",
        asset: "USDC",
        amount: "10",
        theme: "dark",
        network: "PUBLIC",
      });
      const parsed = new URL(url);
      expect(parsed.origin).toBe(WIDGET_ORIGIN);
      expect(parsed.pathname).toBe("/widget");
      expect(parsed.searchParams.get("address")).toBe("CTEST");
      expect(parsed.searchParams.get("asset")).toBe("USDC");
      expect(parsed.searchParams.get("amount")).toBe("10");
      expect(parsed.searchParams.get("theme")).toBe("dark");
      expect(parsed.searchParams.get("network")).toBe("PUBLIC");
      expect(parsed.searchParams.get("parentOrigin")).toBe(window.location.origin);
    });

    it("omits optional params that weren't supplied", () => {
      const url = win.AframpWidget.buildWidgetUrl({ widgetOrigin: WIDGET_ORIGIN, address: "CTEST" });
      const parsed = new URL(url);
      expect(parsed.searchParams.has("asset")).toBe(false);
      expect(parsed.searchParams.has("amount")).toBe(false);
      expect(parsed.searchParams.has("theme")).toBe(false);
      expect(parsed.searchParams.has("network")).toBe(false);
    });
  });

  describe("mount", () => {
    it("throws without widgetOrigin", () => {
      const container = createContainer();
      expect(() => win.AframpWidget.mount(container, { address: "CTEST" })).toThrow(/widgetOrigin/);
    });

    it("throws without address", () => {
      const container = createContainer();
      expect(() => win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN })).toThrow(/address/);
    });

    it("appends an iframe pointed at the widget origin", () => {
      const container = createContainer();
      win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST" });
      const iframe = container.querySelector("iframe");
      expect(iframe).not.toBeNull();
      expect(iframe!.src.startsWith(WIDGET_ORIGIN)).toBe(true);
    });

    it("unmount() removes the iframe", () => {
      const container = createContainer();
      const handle = win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST" });
      expect(container.querySelector("iframe")).not.toBeNull();
      handle.unmount();
      expect(container.querySelector("iframe")).toBeNull();
    });
  });

  describe("postMessage contract and origin rejection (#558)", () => {
    function dispatchFromIframe(container: HTMLElement, data: unknown, origin: string) {
      const iframe = container.querySelector("iframe")!;
      const event = new MessageEvent("message", { data, origin, source: iframe.contentWindow });
      window.dispatchEvent(event);
    }

    it("invokes onSuccess for a genuine success message from the widget's own origin", () => {
      const container = createContainer();
      const onSuccess = vi.fn();
      win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST", onSuccess });

      dispatchFromIframe(
        container,
        { source: "aframp-widget", type: "success", txHash: "abc123", amount: "10", asset: "XLM" },
        WIDGET_ORIGIN,
      );

      expect(onSuccess).toHaveBeenCalledWith({ txHash: "abc123", amount: "10", asset: "XLM" });
    });

    it("invokes onError for an error message", () => {
      const container = createContainer();
      const onError = vi.fn();
      win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST", onError });

      dispatchFromIframe(container, { source: "aframp-widget", type: "error", message: "boom" }, WIDGET_ORIGIN);

      expect(onError).toHaveBeenCalledWith("boom");
    });

    it("invokes onCancel for a cancel message", () => {
      const container = createContainer();
      const onCancel = vi.fn();
      win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST", onCancel });

      dispatchFromIframe(container, { source: "aframp-widget", type: "cancel" }, WIDGET_ORIGIN);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("resizes the iframe on a resize message", () => {
      const container = createContainer();
      win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST" });

      dispatchFromIframe(container, { source: "aframp-widget", type: "resize", height: 420 }, WIDGET_ORIGIN);

      const iframe = container.querySelector("iframe")!;
      expect(iframe.style.height).toBe("420px");
    });

    it("ignores a message from an origin other than the configured widgetOrigin", () => {
      const container = createContainer();
      const onSuccess = vi.fn();
      win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST", onSuccess });

      dispatchFromIframe(
        container,
        { source: "aframp-widget", type: "success", txHash: "abc123", amount: "10", asset: "XLM" },
        "https://evil.example.com",
      );

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("ignores a same-origin message that doesn't carry the widget's source tag", () => {
      const container = createContainer();
      const onSuccess = vi.fn();
      win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST", onSuccess });

      dispatchFromIframe(container, { type: "success", txHash: "abc123" }, WIDGET_ORIGIN);

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("ignores a correctly-shaped message whose source window isn't this mount's iframe", () => {
      // Simulates a second, unrelated same-origin iframe elsewhere on the
      // page posting a lookalike message.
      const containerA = createContainer();
      const containerB = createContainer();
      const onSuccess = vi.fn();
      win.AframpWidget.mount(containerA, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST", onSuccess });
      win.AframpWidget.mount(containerB, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST2" });

      const otherIframe = containerB.querySelector("iframe")!;
      const event = new MessageEvent("message", {
        data: { source: "aframp-widget", type: "success", txHash: "abc123", amount: "10", asset: "XLM" },
        origin: WIDGET_ORIGIN,
        source: otherIframe.contentWindow,
      });
      window.dispatchEvent(event);

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("stops listening after unmount()", () => {
      const container = createContainer();
      const onSuccess = vi.fn();
      const handle = win.AframpWidget.mount(container, { widgetOrigin: WIDGET_ORIGIN, address: "CTEST", onSuccess });
      const iframeWindow = container.querySelector("iframe")!.contentWindow;
      handle.unmount();

      window.dispatchEvent(
        new MessageEvent("message", {
          data: { source: "aframp-widget", type: "success", txHash: "abc123", amount: "10", asset: "XLM" },
          origin: WIDGET_ORIGIN,
          source: iframeWindow,
        }),
      );

      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe("isMessageFromWidget", () => {
    it("matches src/lib/widget.ts's contract: same signature, same rejection rules", () => {
      const fakeWindow = {} as Window;
      const goodEvent = {
        origin: WIDGET_ORIGIN,
        source: fakeWindow,
        data: { source: "aframp-widget" },
      } as MessageEvent;
      expect(win.AframpWidget.isMessageFromWidget(goodEvent, WIDGET_ORIGIN, fakeWindow)).toBe(true);

      const wrongOrigin = { ...goodEvent, origin: "https://evil.example.com" } as MessageEvent;
      expect(win.AframpWidget.isMessageFromWidget(wrongOrigin, WIDGET_ORIGIN, fakeWindow)).toBe(false);
    });
  });
});
