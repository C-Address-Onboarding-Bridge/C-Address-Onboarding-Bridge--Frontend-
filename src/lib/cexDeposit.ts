/**
 * CEX withdrawal → C-address deposit routing (#680).
 *
 * A centralized exchange cannot withdraw directly to a Soroban C-address —
 * its withdrawal form only accepts a classic Stellar G-address (and, for
 * Stellar, an optional memo). The realistic flow is therefore: withdraw to
 * the bridge's own G-address with a memo that identifies the target
 * C-address, and the bridge picks the deposit up from there and funds that
 * C-address.
 *
 * The address + memo scheme here is not invented for this page: it matches
 * the backend's own reference implementation and integration docs
 * (`C-Address-Onboarding-Bridge-Backend`, `cex/README.md` and
 * `docs/wallet-integration.md`), which already document exactly this format
 * for correlating an incoming CEX withdrawal with the C-address it's for:
 *
 *   bridge:{exchange_name}:{c_address_suffix}
 *   e.g. bridge:binance:AB12CD34
 */

/** How many trailing characters of the C-address the memo carries. Matches the backend's own example (`AB12CD34`, 8 chars). */
const MEMO_SUFFIX_LENGTH = 8;

/** Stellar MEMO_TEXT is limited to 28 bytes; the longest supported exchange name (`coinbase`) plus the fixed format still fits comfortably. */
export const MEMO_TEXT_MAX_BYTES = 28;

/**
 * Builds the `bridge:{exchange}:{suffix}` memo a user must attach to their
 * CEX withdrawal so the bridge can match the deposit to `cAddress`.
 *
 * Exposed for direct unit testing; also used by `buildCexDepositUri` below.
 */
export function buildCexDepositMemo(exchangeName: string, cAddress: string): string {
  const suffix = cAddress.slice(-MEMO_SUFFIX_LENGTH);
  return `bridge:${exchangeName.toLowerCase()}:${suffix}`;
}

/**
 * Builds a SEP-0007 `web+stellar:pay` payment URI encoding both the deposit
 * address and the required memo, so a compliant wallet scanning the QR code
 * pre-fills the memo exactly rather than relying on the user to retype it
 * correctly by hand — the single highest-risk step in this flow, since an
 * exchange withdrawal sent without (or with a wrong) memo cannot be matched
 * to any C-address and may be unrecoverable.
 *
 * See https://stellar.org/protocol/sep-7 for the URI scheme.
 */
export function buildCexDepositUri(depositAddress: string, memo: string): string {
  const params = new URLSearchParams({
    destination: depositAddress,
    memo,
    memo_type: "MEMO_TEXT",
  });
  return `web+stellar:pay?${params.toString()}`;
}
