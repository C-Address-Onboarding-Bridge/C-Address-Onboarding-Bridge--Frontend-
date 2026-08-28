import {
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Networks,
  Asset,
  Horizon,
  rpc,
  Account,
  StrKey,
} from "@stellar/stellar-sdk";
import {
  BRIDGE_CONTRACT_ID,
  HORIZON_URL,
  SOROBAN_RPC_URL,
  type BridgeTransactionStatus,
  type StellarNetwork,
  type WalletNetworkState,
  type BridgeTransactionData,
} from "./types";
import { withSequenceRetry } from "./sequenceManager";

export type { AppNetwork, WalletNetworkState, BridgeTransactionData } from "./types";

// ---------------------------------------------------------------------------
// Stellar Wallets Kit — multi-wallet abstraction (#459)
// ---------------------------------------------------------------------------
// We lazily initialise the kit only in the browser, so SSR and tests that do
// not exercise wallet paths never import the kit's browser-only DOM code.
// ---------------------------------------------------------------------------

/** The wallet ID stored in the session. Null means no wallet has been chosen yet. */
export type WalletId = string | null;

/** Lazy singleton kit reference. Populated by initWalletKit(). */
let _kitReady = false;

/**
 * Initialise the Stellar Wallets Kit with the standard set of modules.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Must be called client-side only (not during SSR).
 *
 * @param selectedWalletId - Previously persisted wallet ID to restore, if any.
 */
export async function initWalletKit(selectedWalletId?: string | null): Promise<void> {
  if (_kitReady || typeof window === "undefined") return;

  const [
    { StellarWalletsKit, Networks: KitNetworks },
    { FreighterModule },
    { xBullModule },
    { LobstrModule },
    { AlbedoModule },
    { RabetModule },
  ] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit/sdk"),
    import("@creit.tech/stellar-wallets-kit/modules/freighter"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
    import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
    import("@creit.tech/stellar-wallets-kit/modules/albedo"),
    import("@creit.tech/stellar-wallets-kit/modules/rabet"),
  ]);

  StellarWalletsKit.init({
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new LobstrModule(),
      new AlbedoModule(),
      new RabetModule(),
    ],
    selectedWalletId: selectedWalletId ?? undefined,
  });

  _kitReady = true;
}

/**
 * Open the Stellar Wallets Kit auth modal and resolve with the selected address.
 * Returns null when the user dismisses without connecting.
 *
 * Initialises the kit on first call.
 */
export async function openWalletSelectionModal(): Promise<{ address: string; walletId: string } | null> {
  if (typeof window === "undefined") return null;

  const { StellarWalletsKit } = await import("@creit.tech/stellar-wallets-kit/sdk");

  if (!_kitReady) {
    await initWalletKit();
  }

  try {
    const { address } = await StellarWalletsKit.authModal();
    // After authModal resolves, the selected module is set on the kit.
    const walletId = StellarWalletsKit.selectedModule.productId;
    return { address, walletId };
  } catch {
    // User dismissed the modal or an error occurred.
    return null;
  }
}

/**
 * Return the currently active wallet's productId, or null if no wallet is set.
 * This is a synchronous helper that reads from in-memory kit state.
 */
export function getActiveWalletId(): string | null {
  if (!_kitReady || typeof window === "undefined") return null;
  // The kit exposes selectedModule as a getter that throws if nothing is set.
  // We can't call it synchronously without dynamic import in ESM, so return
  // null here; callers should use the selectedWalletId from the session instead.
  return null;
}

/** Seconds a built transaction stays valid before the network rejects it. */
const TRANSACTION_TIMEOUT_SECONDS = 30;

export async function getHorizonServer(network: StellarNetwork): Promise<Horizon.Server> {
  throw new Error('Not implemented: getHorizonServer');
}

export async function getSorobanRpcServer(network: StellarNetwork): Promise<rpc.Server> {
  throw new Error('Not implemented: getSorobanRpcServer');
}

export async function getNetworkPassphrase(network: StellarNetwork): Promise<string> {
  throw new Error('Not implemented: getNetworkPassphrase');
}

/**
 * Connect a wallet. Opens the Stellar Wallets Kit selection modal so the user
 * can choose Freighter, xBull, Lobstr, Albedo, Rabet, or any other supported
 * wallet. Returns the connected public key, or null when the user cancels.
 *
 * Replaces the previous direct Freighter call so all wallet interaction is
 * routed through the kit's abstraction layer. (#459)
 */
export async function connectWallet(): Promise<string | null> {
  const result = await openWalletSelectionModal();
  return result?.address ?? null;
}

/**
 * Check whether the kit has an active, connected address.
 *
 * The kit keeps the selected address in memory across renders; we use that
 * as the "is connected" signal rather than polling every individual wallet
 * provider, which is both faster and avoids permission-prompt loops. (#459)
 */
export async function checkConnection(): Promise<boolean> {
  if (!_kitReady || typeof window === "undefined") return false;
  try {
    const { StellarWalletsKit } = await import("@creit.tech/stellar-wallets-kit/sdk");
    const { address } = await StellarWalletsKit.getAddress();
    return !!address;
  } catch {
    return false;
  }
}

/**
 * Return the public key for the currently connected wallet, or null.
 */
export async function getWalletAddress(): Promise<string | null> {
  if (!_kitReady || typeof window === "undefined") return null;
  try {
    const { StellarWalletsKit } = await import("@creit.tech/stellar-wallets-kit/sdk");
    const { address } = await StellarWalletsKit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export interface WalletNetworkInfo {
  /** What the app can do with the wallet's current network. */
  status: WalletNetworkState;
  /**
   * The raw, upper-cased network name Freighter reported (e.g. "FUTURENET",
   * "STANDALONE"). Null when the network could not be read at all. Used to name
   * the actual network in the "unsupported network" notice.
   */
  name: string | null;
}

/**
 * Reads the wallet's current network *without* collapsing it into the app's
 * two-value union.
 *
 * Freighter can report FUTURENET, STANDALONE or any custom network, and the
 * query itself can fail. Previously all of those became "TESTNET", so a
 * Futurenet user saw a confident "Testnet" label, had balances read off the
 * wrong chain, and got transactions built with the testnet passphrase — with
 * every resulting error pointing away from the real cause. (#289)
 *
 * Now delegates to whichever wallet the user selected via the kit. (#459)
 */
export async function getWalletNetwork(): Promise<WalletNetworkInfo> {
  if (!_kitReady || typeof window === "undefined") {
    return { status: "UNKNOWN", name: null };
  }
  try {
    const { StellarWalletsKit, Networks: KitNetworks } = await import("@creit.tech/stellar-wallets-kit/sdk");
    const { networkPassphrase } = await StellarWalletsKit.getNetwork();

    // Map kit network passphrase → app WalletNetworkState
    if (networkPassphrase === KitNetworks.PUBLIC) {
      return { status: "PUBLIC", name: "PUBLIC" };
    }
    if (networkPassphrase === KitNetworks.TESTNET) {
      return { status: "TESTNET", name: "TESTNET" };
    }

    // Any other passphrase (Futurenet, Standalone, custom) is unsupported.
    // Derive a human-readable name from the passphrase for the warning notice.
    const knownNames: Record<string, string> = {
      [KitNetworks.FUTURENET]: "FUTURENET",
      [KitNetworks.SANDBOX]: "SANDBOX",
      [KitNetworks.STANDALONE]: "STANDALONE",
    };
    const name = knownNames[networkPassphrase] ?? networkPassphrase.split(";")[0].trim().toUpperCase();
    return { status: "UNSUPPORTED", name };
  } catch {
    return { status: "UNKNOWN", name: null };
  }
}

/**
 * The wallet's current network state, including the "unsupported network" and
 * "couldn't read the network" cases. Callers must handle all four values;
 * see {@link WalletNetworkState}. (#289)
 */
export async function getCurrentNetwork(): Promise<WalletNetworkState> {
  const { status } = await getWalletNetwork();
  return status;
}

/**
 * Human-readable label for a wallet network state, for badges and notices.
 */
export function formatNetworkLabel(
  status: WalletNetworkState,
  name?: string | null
): string {
  if (status === "PUBLIC") return "Mainnet";
  if (status === "TESTNET") return "Testnet";
  if (status === "UNKNOWN") return "Unknown";
  // UNSUPPORTED: use the raw name if available, with title-case
  if (name) {
    const lower = name.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return "Unsupported";
}

// Validate against the SDK's StrKey, which enforces the correct base32
// alphabet (A-Z, 2-7 — no 0/1/8/9) and the trailing CRC16 checksum. A
// hand-rolled regex cannot verify the checksum and, as [G|C] showed, is easy
// to get subtly wrong (that character class also accepted a leading '|').
export function isValidStellarAddress(address: string): boolean {
  throw new Error('Not implemented: isValidStellarAddress');
}

export function isValidStellarAmount(amount: string): boolean {
  throw new Error('Not implemented: isValidStellarAmount');
}

export function isCAddress(address: string): boolean {
  throw new Error('Not implemented: isCAddress');
}

export function isGAddress(address: string): boolean {
  throw new Error('Not implemented: isGAddress');
}

export interface PaymentResult {
  hash: string;
  successful: boolean;
}

export interface AccountBalances {
  total: string;
  balances: { asset: string; amount: string }[];
  /** True when the account does not exist on-chain (unfunded). (#293) */
  unfunded?: boolean;
}

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface HorizonPayment {
  id: string;
  type?: string;
  from?: string;
  to?: string;
  /** Present on payment operations. Absent on create_account operations. (#294) */
  amount?: string;
  /** Starting balance funded to a new account via create_account. (#294) */
  starting_balance?: string;
  asset_type?: string;
  asset_code?: string;
  /**
   * May be absent on older Horizon responses.  When missing we treat the
   * transaction as pending rather than confirmed or failed. (#294)
   */
  transaction_successful?: boolean;
  created_at?: string;
  transaction_hash?: string;
  funder?: string;
  account?: string;
}

/**
 * Short-lived shared cache for account balances, keyed on `address:network`.
 *
 * Both the Bridge page ("Use connected wallet" check) and the Dashboard
 * (mount + 30s poll) fetch balances for the same connected address. Without a
 * shared cache, navigating between these pages triggers a fresh Horizon
 * round-trip even when the data was fetched seconds earlier.
 *
 * The TTL is deliberately short: staleness is bounded to BALANCE_CACHE_TTL_MS,
 * and it stays well under the Dashboard's 30s poll interval so the poll still
 * refetches fresh data on every tick. Entries store the in-flight promise, so
 * concurrent callers within the window share a single request; failed fetches
 * are evicted so the fallback value is never served from cache.
 */
const BALANCE_CACHE_TTL_MS = 10_000; // 10 seconds

interface BalanceCacheEntry {
  promise: Promise<AccountBalances>;
  fetchedAt: number;
}

const balanceCache = new Map<string, BalanceCacheEntry>();

async function loadAccountBalances(
  address: string,
  network: StellarNetwork
): Promise<AccountBalances> {
  const server = await getHorizonServer(network);
  const account = await server.loadAccount(address);
  const balances = (account.balances as HorizonBalance[]).map((b) => ({
    asset: b.asset_type === "native" ? "XLM" : (b.asset_code || "unknown"),
    amount: b.balance,
  }));
  const total = balances.find((b) => b.asset === "XLM")?.amount || "0";
  return { total, balances };
}

/**
 * Inspect an error thrown by Horizon's loadAccount to determine whether it
 * represents an unfunded (non-existent) account or a genuine network/server
 * error.  Horizon returns HTTP 404 with `extras.result_codes` absent for
 * accounts that have never received a funding payment. (#293)
 */
function isUnfundedAccountError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { response?: { status?: number } };
  return e.response?.status === 404;
}

async function withBalanceFallback(
  promise: Promise<AccountBalances>
): Promise<AccountBalances> {
  try {
    return await promise;
  } catch (err) {
    // Distinguish unfunded accounts from real errors so callers can surface
    // a friendlier "account not yet funded" message instead of a generic
    // error. (#293)
    if (isUnfundedAccountError(err)) {
      return { total: "0", balances: [], unfunded: true };
    }
    return { total: "0", balances: [] };
  }
}

export async function getAccountBalances(
  address: string,
  network: "PUBLIC" | "TESTNET"
): Promise<AccountBalances> {
  throw new Error('Not implemented: getAccountBalances');
}

/**
 * Clears the account-balances cache. Primarily for tests; call sites rely on
 * the short TTL rather than manual invalidation.
 */
export function clearAccountBalancesCache(): void {
  throw new Error('Not implemented: clearAccountBalancesCache');
}

export async function fetchRecentTransactions(
  address: string,
  network: StellarNetwork,
  limit: number = 10
): Promise<BridgeTransactionData[]> {
  throw new Error('Not implemented: fetchRecentTransactions');
}

/**
 * Internal helper that handles the shared transaction-building flow used by
 * both buildAndSubmitPayment and bridgeViaContract:
 *   1. Retries on sequence-number conflicts via withSequenceRetry
 *   2. Constructs the Account and TransactionBuilder
 *   3. Signs the XDR via Freighter
 *   4. Rebuilds the signed transaction and submits it
 *
 * Callers supply the resolved `destination` and `asset` up-front so that the
 * two public functions keep their own destination/asset-resolution logic.
 *
 * @param sourceAddress - The G-address that will sign and pay fees
 * @param destination   - The resolved destination address for the payment
 * @param asset         - The resolved Stellar Asset to send
 * @param amount        - Amount as a decimal string (e.g. "10.5")
 * @param network       - "PUBLIC" or "TESTNET"
 * @param server        - An already-initialised Horizon.Server instance
 * @param passphrase    - The network passphrase for signing/rebuilding
 */
async function buildSignAndSubmit(
  sourceAddress: string,
  destination: string,
  asset: Asset,
  amount: string,
  network: StellarNetwork,
  server: Horizon.Server,
  passphrase: string,
  onPhase?: (phase: "signing" | "submitting") => void
): Promise<PaymentResult> {
  // Fetch a dynamic fee bid (2× base fee, capped at 10 000 stroops) so the
  // transaction is not rejected during surge-pricing windows. (#301)
  const fee = await getRecommendedFee(network);

  return withSequenceRetry(
    sourceAddress,
    async (getSequence) => {
      const sequence = await getSequence();
      const account = new Account(sourceAddress, (sequence - 1n).toString());

      const tx = new TransactionBuilder(account, {
        fee,
        networkPassphrase: passphrase,
      })
        .addOperation(
          Operation.payment({
            destination,
            asset,
            amount,
          })
        )
        .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
        .build();

      onPhase?.("signing");

      // #241 — Re-fetch the wallet's current network immediately before
      // signing.  The user may have switched networks in Freighter during the
      // time between the app loading and the "Confirm" click.  If the wallet
      // is no longer on the same network the transaction was built for, abort
      // here with a clear, actionable message rather than signing a transaction
      // that will either fail at submission or, worse, succeed on the wrong
      // chain.
      const currentNetwork = await getCurrentNetwork();
      if (currentNetwork !== network) {
        throw new Error(
          "Network changed in wallet — please retry. " +
          `Transaction was built for ${network} but wallet is now on ${currentNetwork}.`
        );
      }

      // Use the Stellar Wallets Kit to sign — this works regardless of which
      // wallet (Freighter, xBull, Lobstr, etc.) the user selected. (#459)
      const { StellarWalletsKit } = await import("@creit.tech/stellar-wallets-kit/sdk");
      const signedResult = await StellarWalletsKit.signTransaction(tx.toXDR(), {
        networkPassphrase: passphrase,
      });

      // #242 — Runtime shape guard on the wallet's response.  A version
      // mismatch, API change, or compromised extension could return a missing
      // or non-string `signedTxXdr`.  The kit throws on signing errors, so we
      // only need to guard against a missing/empty XDR here.
      const signedXDR = signedResult.signedTxXdr;
      if (typeof signedXDR !== "string" || !signedXDR) {
        throw new Error(
          "Wallet returned an unexpected response while signing — signedTxXdr is missing or empty."
        );
      }

      const signedTx = TransactionBuilder.fromXDR(signedXDR, passphrase);

      onPhase?.("submitting");
      const submitResult = await server.submitTransaction(signedTx);
      return {
        hash: submitResult.hash,
        successful: submitResult.successful,
      };
    },
    server,
    network
  );
}

/** Shortens an address for display in error messages: GABCDEFG…WXYZ. */
function truncateAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 8)}…${address.slice(-4)}`
    : address;
}

/**
 * Reduces an unknown thrown value to a message safe to show directly in a
 * user-facing notification. Failures from Horizon/Soroban RPC and the
 * Stellar SDK can carry raw response bodies (JSON error payloads, result
 * XDR) that were never meant to be read by end users — those are logged to
 * the console for debugging and replaced with `fallback` instead of being
 * rendered verbatim in an alert banner.
 */
export function toSafeErrorMessage(error: unknown, fallback: string): string {
  throw new Error('Not implemented: toSafeErrorMessage');
}

/**
 * Verifies that the active wallet account matches the transaction source address
 * before anything is built or signed.
 *
 * The kit signs with whichever account is active; a mismatch produces a
 * tx_bad_auth rejection at submission. Failing here names both addresses and
 * tells the user what to do. (#287)
 */
export async function assertActiveAccountMatches(sourceAddress: string): Promise<void> {
  const activeAddress = await getWalletAddress();
  if (!activeAddress) {
    throw new Error("No wallet is connected. Please connect your wallet and try again.");
  }
  if (activeAddress !== sourceAddress) {
    throw new Error(
      `Active wallet account (${truncateAddress(activeAddress)}) does not match the source address ` +
      `(${truncateAddress(sourceAddress)}). Switch to the correct account in your wallet and retry.`
    );
  }
}

/**
 * Resolves the Asset a payment should use, validating any non-native
 * trustline against the source account. Shared by buildAndSubmitPayment and
 * bridgeViaContract so neither can silently substitute a different asset
 * than the one the caller (and UI) asked for.
 */
async function resolveAsset(
  server: Horizon.Server,
  sourceAddress: string,
  assetCode: string
): Promise<Asset> {
  if (assetCode === "XLM") {
    return Asset.native();
  }

  const account = await server.loadAccount(sourceAddress);
  const balances = account.balances as HorizonBalance[];
  const matchingBalance = balances.find((b) => b.asset_code === assetCode);
  if (!matchingBalance) {
    throw new Error(`No ${assetCode} trustline found for this account`);
  }
  return new Asset(assetCode, matchingBalance.asset_issuer);
}

export async function buildAndSubmitPayment(
  sourceAddress: string,
  destinationAddress: string,
  amount: string,
  assetCode: string,
  network: StellarNetwork,
  onPhase?: (phase: "signing" | "submitting") => void
): Promise<PaymentResult> {
  throw new Error('Not implemented: buildAndSubmitPayment');
}

/**
 * Bridges an asset from a classic G-address to a Soroban C-address.
 *
 * Classic Stellar payment operations cannot target a contract address — the
 * protocol's PaymentOp.destination is a MuxedAccount, which has no encoding
 * for C... StrKeys. Moving an asset onto a C-address requires invoking that
 * asset's Stellar Asset Contract via Soroban (simulate + prepareTransaction),
 * which isn't implemented yet (tracked in issue #284). Until that lands, this
 * fails loudly and specifically here instead of letting the SDK reject the
 * built operation with an opaque "destination is invalid", or letting a
 * classic payment silently target the wrong address.
 */
export async function bridgeViaContract(
  sourceAddress: string,
  cAddress: string,
  amount: string,
  assetCode: string,
  network: StellarNetwork,
  onPhase?: (phase: "signing" | "submitting") => void
): Promise<PaymentResult> {
  if (!isValidStellarAmount(amount)) {
    throw new Error("Invalid amount: Stellar amounts support at most 7 decimal places and must be greater than 0");
  }

  if (isCAddress(cAddress)) {
    const reason = BRIDGE_CONTRACT_ID
      ? "the configured bridge contract cannot yet be invoked from this app"
      : "no bridge contract is configured";
    throw new Error(
      `Bridging to a Soroban C-address isn't supported yet: classic Stellar payments can't target contract addresses, and ${reason}. Track progress on this in issue #284.`
    );
  }

  // Forward onPhase so the caller's "Signing..."/"Submitting..." states still
  // fire on this path; without it the UI sits on "Signing..." until the
  // transaction resolves.
  return buildAndSubmitPayment(sourceAddress, cAddress, amount, assetCode, network, onPhase);
}

/**
 * Builds a URL to view a transaction, account, or contract on stellar.expert.
 *
 * **Security audit (#338):**
 * - The base URL is always a hardcoded https:// literal for stellar.expert,
 *   derived only from the `network` parameter (which is a validated type).
 * - The `id` is concatenated into the path, not a query param, so URL-injection
 *   via & or # in `id` cannot alter the host or add params. A malicious `id`
 *   can only produce a 404 on stellar.expert, not an open redirect.
 * - Callers (e.g. Dashboard) should validate `id` is a legitimate address or
 *   hash before calling, but the function itself does not allow host/scheme
 *   changes regardless of the `id` value.
 */
export function getExplorerUrl(
  network: StellarNetwork,
  type: "tx" | "account" | "contract",
  id: string
): string {
  throw new Error('Not implemented: getExplorerUrl');
}

export function getAccountMinimumBalance(): string {
  throw new Error('Not implemented: getAccountMinimumBalance');
}

/**
 * Fetch the current recommended fee from the Horizon fee-stats endpoint and
 * return a fee bid that is 2× the network base fee, capped at 10 000 stroops.
 *
 * Using a dynamic fee instead of the hardcoded BASE_FEE constant avoids
 * `tx_insufficient_fee` rejections during surge-pricing windows (when the
 * network raises the minimum fee above 100 stroops). (#301)
 *
 * @param network - "PUBLIC" or "TESTNET"
 * @returns Fee in stroops as a string (e.g. "200")
 */
export async function getRecommendedFee(network: StellarNetwork): Promise<string> {
  throw new Error('Not implemented: getRecommendedFee');
}

/** Stroops per XLM (1 XLM = 10,000,000 stroops). */
const STROOPS_PER_XLM = 10_000_000;

/**
 * Fetch the current estimated network fee and return it as a human-readable
 * XLM string suitable for display on the review screen (e.g. "~0.0002 XLM").
 *
 * Calls {@link getRecommendedFee} which already handles the Horizon
 * fee-stats fetch and falls back to BASE_FEE on error, so this function
 * never throws. (#257)
 *
 * @param network - "PUBLIC" or "TESTNET"
 * @returns Fee string in the form "~X.XXXXXXX XLM"
 */
export async function getEstimatedFeeXLM(network: StellarNetwork): Promise<string> {
  throw new Error('Not implemented: getEstimatedFeeXLM');
}
