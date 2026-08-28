import {
  isConnected,
  getAddress,
  signTransaction,
  getNetwork,
} from "@stellar/freighter-api";
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

/** Seconds a built transaction stays valid before the network rejects it. */
const TRANSACTION_TIMEOUT_SECONDS = 30;

export async function getHorizonServer(network: StellarNetwork): Promise<Horizon.Server> {
  return new Horizon.Server(HORIZON_URL[network]);
}

export async function getSorobanRpcServer(network: StellarNetwork): Promise<rpc.Server> {
  const url = SOROBAN_RPC_URL[network];
  if (!url) {
    throw new Error(
      `No Soroban RPC URL configured for ${network}. Set NEXT_PUBLIC_SOROBAN_RPC_URL_${network} in your environment.`
    );
  }
  return new rpc.Server(url);
}

export async function getNetworkPassphrase(network: StellarNetwork): Promise<string> {
  return network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
}

export async function connectWallet(): Promise<string | null> {
  try {
    const conn = await isConnected();
    if (!conn.isConnected) {
      throw new Error("Freighter not detected");
    }
    const addr = await getAddress();
    return addr.address;
  } catch (e) {
    console.error("Failed to connect wallet:", e);
    return null;
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    const result = await isConnected();
    return result.isConnected;
  } catch {
    return false;
  }
}

export async function getWalletAddress(): Promise<string | null> {
  try {
    const result = await getAddress();
    return result.address;
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
 */
export async function getWalletNetwork(): Promise<WalletNetworkInfo> {
  try {
    const result = await getNetwork();
    // Freighter reports failures in-band via `error` as well as by throwing.
    if (result && typeof result === "object" && "error" in result && result.error) {
      return { status: "UNKNOWN", name: null };
    }
    const name = String(result.network ?? "").toUpperCase();
    if (name === "PUBLIC" || name === "TESTNET") {
      return { status: name, name };
    }
    return { status: "UNSUPPORTED", name: name || null };
  } catch {
    // Couldn't query the wallet — do NOT pretend it's testnet.
    return { status: "UNKNOWN", name: null };
  }
}

/**
 * The wallet's current network state, including the "unsupported network" and
 * "couldn't read the network" cases. Callers must handle all four values;
 * see {@link WalletNetworkState}. (#289)
 */
export async function getCurrentNetwork(): Promise<WalletNetworkState> {
  return (await getWalletNetwork()).status;
}

/**
 * Human-readable label for a wallet network state, for badges and notices.
 */
export function formatNetworkLabel(
  status: WalletNetworkState,
  name?: string | null
): string {
  switch (status) {
    case "PUBLIC":
      return "Mainnet";
    case "TESTNET":
      return "Testnet";
    case "UNSUPPORTED":
      return name ? `${name.charAt(0)}${name.slice(1).toLowerCase()}` : "Unsupported";
    case "UNKNOWN":
      return "Unknown";
  }
}

// Validate against the SDK's StrKey, which enforces the correct base32
// alphabet (A-Z, 2-7 — no 0/1/8/9) and the trailing CRC16 checksum. A
// hand-rolled regex cannot verify the checksum and, as [G|C] showed, is easy
// to get subtly wrong (that character class also accepted a leading '|').
export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address);
}

export function isValidStellarAmount(amount: string): boolean {
  if (!amount || typeof amount !== "string") return false;
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) return false;
  const num = Number(amount);
  return !isNaN(num) && num > 0;
}

export function isCAddress(address: string): boolean {
  return StrKey.isValidContract(address);
}

export function isGAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
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
  // Reject structurally invalid addresses before hitting the network.
  // An empty or malformed address would produce an opaque Horizon 400/404
  // that obscures the real cause and could log confusing errors.
  if (!isValidStellarAddress(address)) {
    return { total: "0", balances: [] };
  }

  const key = `${address}:${network}`;
  const now = Date.now();

  const cached = balanceCache.get(key);
  if (cached && now - cached.fetchedAt < BALANCE_CACHE_TTL_MS) {
    return withBalanceFallback(cached.promise);
  }

  const promise = loadAccountBalances(address, network);
  balanceCache.set(key, { promise, fetchedAt: now });

  // Evict on failure so the "0 balance" fallback is not served from cache and
  // the next call retries against the network.
  promise.catch(() => {
    if (balanceCache.get(key)?.promise === promise) {
      balanceCache.delete(key);
    }
  });

  return withBalanceFallback(promise);
}

/**
 * Clears the account-balances cache. Primarily for tests; call sites rely on
 * the short TTL rather than manual invalidation.
 */
export function clearAccountBalancesCache(): void {
  balanceCache.clear();
}

export async function fetchRecentTransactions(
  address: string,
  network: StellarNetwork,
  limit: number = 10
): Promise<BridgeTransactionData[]> {
  // Reject invalid addresses before hitting the network and clamp the
  // limit to a safe range (1–200) to prevent unexpectedly large requests.
  if (!isValidStellarAddress(address)) {
    return [];
  }
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  const server = await getHorizonServer(network);
  try {
    const payments = await server
      .payments()
      .forAccount(address)
      .limit(safeLimit)
      .order("desc")
      .call();

    return (payments.records as HorizonPayment[]).map((p) => {
      // create_account operations use `funder`/`account` and `starting_balance`
      // instead of the `from`/`to`/`amount` fields present on payment ops. (#294)
      const isCreateAccount = p.type === "create_account";
      const fromAddress = isCreateAccount ? (p.funder || "") : (p.from || "");
      const toAddress = isCreateAccount ? (p.account || "") : (p.to || "");
      const amount = isCreateAccount
        ? (p.starting_balance || "0")
        : (p.amount || "0");

      // When `transaction_successful` is absent (older Horizon versions) we
      // treat the record as pending rather than assuming it failed. (#294)
      let status: BridgeTransactionStatus;
      if (p.transaction_successful === undefined || p.transaction_successful === null) {
        status = "pending";
      } else {
        status = p.transaction_successful ? "confirmed" : "failed";
      }

      return {
        id: p.id,
        fromAddress,
        toAddress,
        amount,
        asset: p.asset_type === "native" || isCreateAccount ? "XLM" : (p.asset_code || "XLM"),
        status,
        timestamp: new Date(p.created_at || Date.now()).getTime(),
        type: "g-to-c" as const,
        hash: p.transaction_hash,
      };
    });
  } catch {
    return [];
  }
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
          "Network changed in Freighter — please retry. " +
          `Transaction was built for ${network} but Freighter is now on ${currentNetwork}.`
        );
      }

      const signedResult = await signTransaction(tx.toXDR(), {
        networkPassphrase: passphrase,
      });

      if ("error" in signedResult && signedResult.error) {
        throw new Error(`Signing failed: ${signedResult.error}`);
      }

      // #242 — Runtime shape guard on the wallet's response.  TypeScript's
      // type assertion above provides no runtime guarantee: a version mismatch,
      // an API change in the Freighter extension, or a compromised extension
      // could return a missing or non-string `signedTxXdr`.  Catching that
      // here produces a clear "unexpected wallet response" error instead of a
      // confusing low-level parse failure inside TransactionBuilder.fromXDR.
      const signedXDR = (signedResult as { signedTxXdr: string }).signedTxXdr;
      if (typeof signedXDR !== "string" || !signedXDR) {
        // Deliberately avoids wallet-API jargon (XDR) so the message stays
        // readable for a user who just saw a malformed wallet response.
        throw new Error(
          "Wallet returned an unexpected response while signing — the signed transaction is missing or empty."
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
  console.error(error);
  if (!(error instanceof Error) || !error.message) return fallback;
  const looksLikeRawPayload = /[{}]/.test(error.message) || error.message.length > 200;
  return looksLikeRawPayload ? fallback : error.message;
}

/**
 * Verifies that Freighter's active account is the account that will source the
 * transaction, *before* anything is built or signed.
 *
 * Freighter signs with whichever account is active, not with the account named
 * as the transaction source. A transaction sourced from address A carrying only
 * B's signature fails at submission with tx_bad_auth — an opaque error that
 * says nothing about the actual mismatch. Failing here instead names both
 * addresses and tells the user what to do. (#287)
 */
export async function assertActiveAccountMatches(sourceAddress: string): Promise<void> {
  const active = await getWalletAddress();

  if (!active) {
    throw new Error(
      "Couldn't read Freighter's active account. Connect (or unlock) Freighter and try again."
    );
  }

  if (active !== sourceAddress) {
    throw new Error(
      `Freighter's active account (${truncateAddress(active)}) doesn't match the From address (${truncateAddress(sourceAddress)}). ` +
        "Switch accounts in Freighter or use the connected address."
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
  // Defence in depth: re-validate destination and amount independently of
  // whatever UI guard called this. A caller that skips or weakens its own
  // validation must not be able to get an SDK-built, signed, and submitted
  // transaction out of this function with a malformed destination or amount.
  if (!isValidStellarAddress(destinationAddress)) {
    throw new Error("Invalid destination address");
  }
  if (!isValidStellarAmount(amount)) {
    throw new Error("Invalid amount: Stellar amounts support at most 7 decimal places and must be greater than 0");
  }

  // Defence in depth: the UI binds the From field to the connected wallet, but
  // a mismatch here would only surface as tx_bad_auth after signing. (#287)
  await assertActiveAccountMatches(sourceAddress);

  const server = await getHorizonServer(network);
  const passphrase = await getNetworkPassphrase(network);
  const asset = await resolveAsset(server, sourceAddress, assetCode);

  return buildSignAndSubmit(
    sourceAddress,
    destinationAddress,
    asset,
    amount,
    network,
    server,
    passphrase,
    onPhase
  );
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
  const base = network === "PUBLIC"
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";
  // Encode the id segment to prevent path-traversal or injection via a
  // crafted id value (e.g. one containing "../" or "?" characters).
  const safeId = encodeURIComponent(id);
  return `${base}/${type}/${safeId}`;
}

export function getAccountMinimumBalance(): string {
  return "1.0";
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
  const MAX_FEE_STROOPS = 10_000;
  try {
    const server = await getHorizonServer(network);
    // fetchBaseFee() returns a number representing the current minimum fee in stroops.
    const baseFee = await server.fetchBaseFee();
    const bid = Math.min(baseFee * 2, MAX_FEE_STROOPS);
    return String(bid);
  } catch {
    // Fall back to the hardcoded BASE_FEE constant if the fee-stats call fails
    // so the transaction is still submitted rather than silently blocked.
    return BASE_FEE;
  }
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
  const stroops = await getRecommendedFee(network);
  const xlm = Number(stroops) / STROOPS_PER_XLM;
  // Show up to 7 decimal places and strip trailing zeros so
  // "~0.00002 XLM" is shown rather than "~0.0000200 XLM".
  const formatted = xlm.toFixed(7).replace(/\.?0+$/, "") || "0";
  return `~${formatted} XLM`;
}

// ─── Transaction simulation (#478) ─────────────────────────────────────────────
//
// Before the wallet prompt the bridge flow shows what the transaction would
// do: the fee, the net amount the recipient receives, and whether the payment
// would fail at all, with the specific reason. The pure {@link simulatePayment}
// does the prediction from already-fetched account state; the async
// {@link simulateBridgeTransaction} feeds it from Horizon (it is also what the
// /api/simulate endpoint calls). Simulation is a prediction — state can change
// before submission — which the UI states explicitly.

/** Why a simulated transaction would fail. */
export type SimulationFailureReason =
  | "invalid_destination"
  | "invalid_amount"
  | "insufficient_balance"
  | "missing_trustline"
  | "unfunded_source"
  | "simulation_unavailable";

export interface SimulationSuccess {
  ok: true;
  /** Predicted fee in stroops. */
  feeStroops: string;
  /** Human-readable fee, e.g. "0.00002 XLM". */
  feeXlm: string;
  /** Amount the recipient would receive after fees (XLM only). */
  netAmount: string;
  /** The gross amount requested. */
  grossAmount: string;
  asset: string;
  recipient: string;
}

export interface SimulationFailure {
  ok: false;
  reason: SimulationFailureReason;
  /** User-facing explanation of the specific failure. */
  message: string;
}

export type SimulationResult = SimulationSuccess | SimulationFailure;

export interface SimulatePaymentInput {
  sourceAddress: string;
  destinationAddress: string;
  amount: string;
  assetCode: string;
}

const SIMULATION_FAILURE_MESSAGES: Record<SimulationFailureReason, string> = {
  invalid_destination:
    "The destination address isn't a valid Stellar address, so the payment would be rejected.",
  invalid_amount:
    "The amount isn't valid — Stellar amounts are positive numbers with at most 7 decimal places.",
  insufficient_balance:
    "The source account doesn't have enough spendable balance for this payment plus fees.",
  missing_trustline:
    "The source account has no trustline for this asset, so the payment would be rejected.",
  unfunded_source:
    "The source account doesn't exist on this network yet, so it can't send a payment.",
  simulation_unavailable:
    "The transaction couldn't be simulated right now. Check your connection and review the details before submitting.",
};

/** Formats a fee in XLM without the "~" prefix used by the static estimate. */
function formatFeeXlm(xlm: number): string {
  const formatted = xlm.toFixed(7).replace(/\.?0+$/, "") || "0";
  return `${formatted} XLM`;
}

/**
 * Predicts the outcome of a Stellar payment from already-fetched account state.
 *
 * Pure and deterministic so every predicted failure reason is unit-testable
 * without a network: given the request plus the source account's balances and
 * the current fee bid, it returns either the fee/net-amount/recipient preview
 * or the specific reason the payment would fail.
 *
 * Fees are paid in XLM. For XLM payments the fee is deducted from the sent
 * amount (net < gross); for other assets the recipient receives the full
 * amount and the fee is charged against the XLM balance instead.
 */
export function simulatePayment(
  input: SimulatePaymentInput,
  balances: AccountBalances,
  feeStroops: number
): SimulationResult {
  const { destinationAddress, amount, assetCode } = input;

  if (!isValidStellarAddress(destinationAddress)) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: SIMULATION_FAILURE_MESSAGES.invalid_destination,
    };
  }

  if (!isValidStellarAmount(amount)) {
    return {
      ok: false,
      reason: "invalid_amount",
      message: SIMULATION_FAILURE_MESSAGES.invalid_amount,
    };
  }

  if (balances.unfunded) {
    return {
      ok: false,
      reason: "unfunded_source",
      message: SIMULATION_FAILURE_MESSAGES.unfunded_source,
    };
  }

  const feeXlm = feeStroops / STROOPS_PER_XLM;

  if (assetCode === "XLM") {
    const total = Number(balances.total || "0");
    const spendable = total - Number(getAccountMinimumBalance());
    if (Number(amount) > spendable) {
      return {
        ok: false,
        reason: "insufficient_balance",
        message: SIMULATION_FAILURE_MESSAGES.insufficient_balance,
      };
    }
    return {
      ok: true,
      feeStroops: String(feeStroops),
      feeXlm: formatFeeXlm(feeXlm),
      netAmount: String(Math.max(0, Number(amount) - feeXlm)),
      grossAmount: amount,
      asset: assetCode,
      recipient: destinationAddress,
    };
  }

  const balance = balances.balances.find((b) => b.asset === assetCode);
  if (!balance) {
    return {
      ok: false,
      reason: "missing_trustline",
      message: SIMULATION_FAILURE_MESSAGES.missing_trustline,
    };
  }
  if (Number(amount) > Number(balance.amount)) {
    return {
      ok: false,
      reason: "insufficient_balance",
      message: SIMULATION_FAILURE_MESSAGES.insufficient_balance,
    };
  }
  return {
    ok: true,
    feeStroops: String(feeStroops),
    feeXlm: formatFeeXlm(feeXlm),
    netAmount: amount,
    grossAmount: amount,
    asset: assetCode,
    recipient: destinationAddress,
  };
}

/**
 * Simulates a bridge payment against live account state (#478).
 *
 * Fetches the source account's balances and the current recommended fee from
 * Horizon and runs {@link simulatePayment}. Any failure to gather that state
 * (offline, Horizon unreachable, bad address) is reported as
 * `simulation_unavailable` rather than thrown, so the caller can degrade to a
 * plain review screen instead of blocking the flow on infrastructure.
 */
export async function simulateBridgeTransaction(
  input: SimulatePaymentInput,
  network: StellarNetwork
): Promise<SimulationResult> {
  try {
    const [balances, fee] = await Promise.all([
      getAccountBalances(input.sourceAddress, network),
      getRecommendedFee(network),
    ]);
    return simulatePayment(input, balances, Number(fee));
  } catch {
    return {
      ok: false,
      reason: "simulation_unavailable",
      message: SIMULATION_FAILURE_MESSAGES.simulation_unavailable,
    };
  }
}
