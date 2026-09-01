import { describe, it, expect, vi } from "vitest";
import {
  buildWidgetSearchParams,
  isMessageFromWidget,
  parseWidgetConfig,
  postWidgetMessage,
  WIDGET_MESSAGE_SOURCE,
  type WidgetOutboundMessage,
} from "../widget";

// A real, checksum-valid C-address (Soroban smart account).
const C_ADDRESS = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const HOST_ORIGIN = "https://example-dapp.com";

function params(overrides: Record<string, string | undefined> = {}): URLSearchParams {
  const base: Record<string, string> = {
    address: C_ADDRESS,
    parentOrigin: HOST_ORIGIN,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete base[key];
  }
  return new URLSearchParams(base);
}

describe("parseWidgetConfig", () => {
  it("accepts a minimal valid config, defaulting asset/theme/network", () => {
    const result = parseWidgetConfig(params());
    expect(result).toEqual({
      ok: true,
      config: {
        address: C_ADDRESS,
        asset: "XLM",
        amount: "",
        theme: "light",
        network: "TESTNET",
        parentOrigin: HOST_ORIGIN,
      },
    });
  });

  it("accepts explicit asset, amount, theme, and network", () => {
    const result = parseWidgetConfig(
      params({ asset: "usdc", amount: "10.5", theme: "dark", network: "PUBLIC" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.asset).toBe("USDC");
      expect(result.config.amount).toBe("10.5");
      expect(result.config.theme).toBe("dark");
      expect(result.config.network).toBe("PUBLIC");
    }
  });

  it("rejects a missing address", () => {
    const result = parseWidgetConfig(params({ address: undefined }));
    expect(result).toEqual({ ok: false, error: "Missing required param: address" });
  });

  it("rejects a G-address (not a C-address)", () => {
    const gAddress = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
    const result = parseWidgetConfig(params({ address: gAddress }));
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed address", () => {
    const result = parseWidgetConfig(params({ address: "not-an-address" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported asset", () => {
    const result = parseWidgetConfig(params({ asset: "DOGE" }));
    expect(result).toEqual({ ok: false, error: "asset must be one of: XLM, USDC" });
  });

  it("rejects an invalid amount", () => {
    const result = parseWidgetConfig(params({ amount: "-5" }));
    expect(result.ok).toBe(false);
  });

  it("falls back to 'light' for an unrecognized theme instead of erroring", () => {
    const result = parseWidgetConfig(params({ theme: "purple" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.theme).toBe("light");
  });

  it("rejects a missing parentOrigin", () => {
    const result = parseWidgetConfig(params({ parentOrigin: undefined }));
    expect(result).toEqual({ ok: false, error: "Missing required param: parentOrigin" });
  });

  it("rejects a parentOrigin that isn't origin-only (has a path)", () => {
    const result = parseWidgetConfig(params({ parentOrigin: `${HOST_ORIGIN}/checkout` }));
    expect(result.ok).toBe(false);
  });

  it("rejects a parentOrigin that isn't a valid URL at all", () => {
    const result = parseWidgetConfig(params({ parentOrigin: "not a url" }));
    expect(result.ok).toBe(false);
  });
});

describe("buildWidgetSearchParams", () => {
  it("round-trips through parseWidgetConfig", () => {
    const search = buildWidgetSearchParams({
      address: C_ADDRESS,
      asset: "USDC",
      amount: "5",
      theme: "dark",
      network: "PUBLIC",
      parentOrigin: HOST_ORIGIN,
    });
    const result = parseWidgetConfig(search);
    expect(result).toEqual({
      ok: true,
      config: {
        address: C_ADDRESS,
        asset: "USDC",
        amount: "5",
        theme: "dark",
        network: "PUBLIC",
        parentOrigin: HOST_ORIGIN,
      },
    });
  });

  it("omits optional keys entirely rather than writing empty values", () => {
    const search = buildWidgetSearchParams({ address: C_ADDRESS, parentOrigin: HOST_ORIGIN });
    expect(search.has("asset")).toBe(false);
    expect(search.has("amount")).toBe(false);
    expect(search.has("theme")).toBe(false);
    expect(search.has("network")).toBe(false);
  });
});

describe("postWidgetMessage", () => {
  it("always posts to the exact declared parent origin, never '*'", () => {
    const target = { postMessage: vi.fn() };
    const message: WidgetOutboundMessage = { source: WIDGET_MESSAGE_SOURCE, type: "ready" };

    postWidgetMessage(target, message, HOST_ORIGIN);

    expect(target.postMessage).toHaveBeenCalledWith(message, HOST_ORIGIN);
    expect(target.postMessage).not.toHaveBeenCalledWith(expect.anything(), "*");
  });
});

describe("isMessageFromWidget — origin validation (#558)", () => {
  const widgetOrigin = "https://bridge.example.com";
  const goodMessage = { source: WIDGET_MESSAGE_SOURCE, type: "ready" as const };

  it("accepts a message whose origin matches the widget's origin", () => {
    expect(isMessageFromWidget({ origin: widgetOrigin, source: null, data: goodMessage }, widgetOrigin)).toBe(
      true,
    );
  });

  it("rejects a message from an unrelated origin, even with a well-formed payload", () => {
    expect(
      isMessageFromWidget({ origin: "https://evil.example.com", source: null, data: goodMessage }, widgetOrigin),
    ).toBe(false);
  });

  it("rejects a message whose origin is merely a substring/lookalike of the widget origin", () => {
    expect(
      isMessageFromWidget(
        { origin: "https://bridge.example.com.evil.com", source: null, data: goodMessage },
        widgetOrigin,
      ),
    ).toBe(false);
  });

  it("rejects a same-origin message that doesn't carry the widget's source tag", () => {
    // Guards against another script on the widget's own origin (or a
    // same-origin ad/analytics iframe) posting something that happens to
    // pass the origin check.
    expect(
      isMessageFromWidget({ origin: widgetOrigin, source: null, data: { unrelated: true } }, widgetOrigin),
    ).toBe(false);
  });

  it("rejects when the source window doesn't match the expected iframe", () => {
    const iframeWindow = {} as Window;
    const otherWindow = {} as Window;
    expect(
      isMessageFromWidget(
        { origin: widgetOrigin, source: otherWindow, data: goodMessage },
        widgetOrigin,
        iframeWindow,
      ),
    ).toBe(false);
  });

  it("accepts when the source window matches the expected iframe", () => {
    const iframeWindow = {} as Window;
    expect(
      isMessageFromWidget(
        { origin: widgetOrigin, source: iframeWindow, data: goodMessage },
        widgetOrigin,
        iframeWindow,
      ),
    ).toBe(true);
  });
});
