/**
 * Embeddable funding widget — shared contract (#558).
 *
 * Pure config-parsing and postMessage helpers used by both sides of the
 * embed: the widget page itself (`src/app/widget/page.tsx`, running inside
 * a third-party host's iframe) and the host-facing loader
 * (`public/aframp-widget.js`, running on the host page). Kept dependency-free
 * (no React, no wallet-provider, no routing) so the widget page that imports
 * it stays small and standalone, per the issue's own requirement.
 */
import { isCAddress, isValidStellarAddress, isValidStellarAmount } from "./stellar";
import { STELLAR_NETWORK, type StellarNetwork } from "./types";

export const WIDGET_MESSAGE_SOURCE = "aframp-widget" as const;

/** Assets the widget will accept a preset amount/asset param for. */
export const WIDGET_ASSETS = ["XLM", "USDC"] as const;
export type WidgetAsset = (typeof WIDGET_ASSETS)[number];

export type WidgetTheme = "light" | "dark";

export interface WidgetConfig {
  /** Destination C-address to fund. Required. */
  address: string;
  asset: WidgetAsset;
  /** Preset amount; blank lets the payer choose their own. */
  amount: string;
  theme: WidgetTheme;
  network: StellarNetwork;
  /**
   * The host page's own origin, declared explicitly by the embedder rather
   * than inferred from `document.referrer` (spoofable/often absent) — the
   * widget only ever posts results back to this exact origin.
   */
  parentOrigin: string;
}

export type WidgetConfigError = { ok: false; error: string };
export type WidgetConfigResult = { ok: true; config: WidgetConfig } | WidgetConfigError;

function isWidgetAsset(value: string | null): value is WidgetAsset {
  return value !== null && (WIDGET_ASSETS as readonly string[]).includes(value);
}

function isStellarNetwork(value: string | null): value is StellarNetwork {
  return value !== null && value in STELLAR_NETWORK;
}

/**
 * Validates and normalizes the widget's URL query params into a
 * `WidgetConfig`, or a single user-facing error describing the first
 * problem found. Used by the widget page on mount, and safe to call
 * server-side too (no DOM access).
 */
export function parseWidgetConfig(params: URLSearchParams): WidgetConfigResult {
  const address = (params.get("address") ?? "").trim();
  if (!address) return { ok: false, error: "Missing required param: address" };
  if (!isValidStellarAddress(address) || !isCAddress(address)) {
    return { ok: false, error: "address must be a valid C-address (Soroban smart account)" };
  }

  const assetParam = params.get("asset");
  const asset: WidgetAsset = assetParam === null ? "XLM" : assetParam.toUpperCase();
  if (!isWidgetAsset(asset)) {
    return { ok: false, error: `asset must be one of: ${WIDGET_ASSETS.join(", ")}` };
  }

  const amount = params.get("amount") ?? "";
  if (amount && !isValidStellarAmount(amount)) {
    return { ok: false, error: "amount must be a positive number with up to 7 decimal places" };
  }

  const themeParam = params.get("theme");
  const theme: WidgetTheme = themeParam === "dark" ? "dark" : "light";

  const networkParam = params.get("network");
  const network: StellarNetwork = isStellarNetwork(networkParam) ? networkParam : "TESTNET";

  const parentOrigin = (params.get("parentOrigin") ?? "").trim();
  if (!parentOrigin) return { ok: false, error: "Missing required param: parentOrigin" };
  try {
    const parsed = new URL(parentOrigin);
    if (parsed.origin !== parentOrigin) {
      return { ok: false, error: "parentOrigin must be an origin only (scheme://host[:port]), no path" };
    }
  } catch {
    return { ok: false, error: "parentOrigin must be a valid absolute URL origin" };
  }

  return { ok: true, config: { address, asset, amount, theme, network, parentOrigin } };
}

// ── postMessage contract ────────────────────────────────────────────────────

export type WidgetOutboundMessage =
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "ready" }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "resize"; height: number }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "success"; txHash: string; amount: string; asset: WidgetAsset }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "error"; message: string }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: "cancel" };

/**
 * Posts a result to the host page. Always targets the exact `parentOrigin`
 * the embedder declared — never `"*"` — so a result can't be delivered to
 * (or intercepted from) a different parent than the one that configured
 * this widget instance.
 */
export function postWidgetMessage(
  target: Pick<Window, "postMessage">,
  message: WidgetOutboundMessage,
  parentOrigin: string
): void {
  target.postMessage(message, parentOrigin);
}

/**
 * True when a `message` event genuinely came from this widget's iframe: the
 * event's `origin` matches the widget's own origin (not the host's), and, if
 * a `source` window is supplied, it matches the iframe's `contentWindow`.
 * Used on the host/loader side — the receiving end has to distrust every
 * `message` event by default, since any page can post to any window it has
 * a reference to.
 */
export function isMessageFromWidget(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  widgetOrigin: string,
  iframeWindow?: Window | null
): boolean {
  if (event.origin !== widgetOrigin) return false;
  if (iframeWindow !== undefined && event.source !== iframeWindow) return false;
  const data = event.data as { source?: unknown } | null | undefined;
  return !!data && typeof data === "object" && data.source === WIDGET_MESSAGE_SOURCE;
}

/** Serializes a `WidgetConfig`-shaped set of embed options into a widget URL's query string. */
export function buildWidgetSearchParams(options: {
  address: string;
  asset?: WidgetAsset;
  amount?: string;
  theme?: WidgetTheme;
  network?: StellarNetwork;
  parentOrigin: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("address", options.address);
  if (options.asset) params.set("asset", options.asset);
  if (options.amount) params.set("amount", options.amount);
  if (options.theme) params.set("theme", options.theme);
  if (options.network) params.set("network", options.network);
  params.set("parentOrigin", options.parentOrigin);
  return params;
}
