/**
 * Funding-request link helpers. (#460)
 *
 * A funding link encodes a Soroban C-address (or G-address) as the `target`
 * query parameter, with optional `amount` and `asset` parameters. Opening the
 * link in the bridge form pre-fills the destination so the funder only has to
 * confirm rather than type out a 56-character address.
 *
 * All generation and parsing is client-side — no address or amount ever leaves
 * the browser to construct a URL.
 */

import { isValidStellarAddress, isValidStellarAmount } from "./stellar";

/** The supported asset codes for funding requests. */
export const FUNDING_LINK_ASSETS = ["XLM", "USDC"] as const;
export type FundingLinkAsset = (typeof FUNDING_LINK_ASSETS)[number];

/** Parsed, validated parameters from a funding-request link. */
export interface FundingLinkParams {
  /** The destination address (C-address or G-address). */
  target: string;
  /** Optional pre-filled amount (positive, ≤7 dp). */
  amount?: string;
  /** Optional pre-filled asset code. Defaults to "XLM" if absent. */
  asset?: FundingLinkAsset;
}

/** Error codes for malformed funding links. */
export type FundingLinkError =
  | "MISSING_TARGET"
  | "INVALID_TARGET"
  | "INVALID_AMOUNT"
  | "INVALID_ASSET";

/** Result type for parseFundingLink. */
export type FundingLinkResult =
  | { ok: true; params: FundingLinkParams }
  | { ok: false; error: FundingLinkError; message: string };

/**
 * Builds a shareable funding-request URL.
 *
 * @param baseUrl  - The origin + pathname of the bridge page (e.g. "https://example.com/bridge")
 * @param params   - The funding-link parameters
 * @returns        The full URL string
 */
export function buildFundingLink(baseUrl: string, params: FundingLinkParams): string {
  const url = new URL(baseUrl);
  url.searchParams.set("target", params.target);
  if (params.amount) {
    url.searchParams.set("amount", params.amount);
  }
  if (params.asset && params.asset !== "XLM") {
    url.searchParams.set("asset", params.asset);
  }
  return url.toString();
}

/**
 * Parses and validates the query parameters from a funding-request URL.
 *
 * Validates:
 * - `target` is present and is a valid Stellar address (G or C)
 * - `amount`, if present, is a valid positive Stellar amount (≤7 dp)
 * - `asset`, if present, is one of the supported asset codes
 *
 * @param searchParams - A `URLSearchParams` instance (or `null` for SSR)
 * @returns            A discriminated-union result
 */
export function parseFundingLink(
  searchParams: URLSearchParams | null
): FundingLinkResult {
  if (!searchParams) {
    return { ok: false, error: "MISSING_TARGET", message: "No link parameters found." };
  }

  const target = searchParams.get("target");
  if (!target) {
    return {
      ok: false,
      error: "MISSING_TARGET",
      message: "The link is missing a destination address.",
    };
  }

  if (!isValidStellarAddress(target)) {
    return {
      ok: false,
      error: "INVALID_TARGET",
      message: `"${target.slice(0, 10)}…" is not a valid Stellar address.`,
    };
  }

  const amount = searchParams.get("amount") ?? undefined;
  if (amount !== undefined && !isValidStellarAmount(amount)) {
    return {
      ok: false,
      error: "INVALID_AMOUNT",
      message: `The requested amount "${amount}" is not valid. Amounts must be positive with at most 7 decimal places.`,
    };
  }

  const rawAsset = searchParams.get("asset") ?? undefined;
  let asset: FundingLinkAsset | undefined;
  if (rawAsset !== undefined) {
    const upper = rawAsset.toUpperCase();
    if (!(FUNDING_LINK_ASSETS as readonly string[]).includes(upper)) {
      return {
        ok: false,
        error: "INVALID_ASSET",
        message: `"${rawAsset}" is not a supported asset. Supported assets: ${FUNDING_LINK_ASSETS.join(", ")}.`,
      };
    }
    asset = upper as FundingLinkAsset;
  }

  return {
    ok: true,
    params: {
      target,
      ...(amount !== undefined ? { amount } : {}),
      ...(asset !== undefined ? { asset } : {}),
    },
  };
}

/**
 * True when the query string contains any funding-link parameter (`target`,
 * `amount`, or `asset`). Used to decide whether to show the pre-fill banner
 * without doing full validation.
 */
export function hasFundingLinkParams(searchParams: URLSearchParams | null): boolean {
  if (!searchParams) return false;
  return (
    searchParams.has("target") ||
    searchParams.has("amount") ||
    searchParams.has("asset")
  );
}
