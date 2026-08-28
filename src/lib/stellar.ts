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
  throw new Error('Not implemented: getHorizonServer');
}

export async function getSorobanRpcServer(network: StellarNetwork): Promise<rpc.Server> {
  throw new Error('Not implemented: getSorobanRpcServer');
}

export async function getNetworkPassphrase(network: StellarNetwork): Promise<string> {
  throw new Error('Not implemented: getNetworkPassphrase');
}

export async function connectWallet(): Promise<string | null> {
  throw new Error('Not implemented: connectWallet');
}

export async function checkConnection(): Promise<boolean> {
  throw new Error('Not implemented: checkConnection');
}

export async function getWalletAddress(): Promise<string | null> {
  throw new Error('Not implemented: getWalletAddress');
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
  throw new Error('Not implemented: getWalletNetwork');
}

/**
 * The wallet's current network state, including the "unsupported network" and
 * "couldn't read the network" cases. Callers must handle all four values;
 * see {@link WalletNetworkState}. (#289)
 */
export async function getCurrentNetwork(): Promise<WalletNetworkState> {
  throw new Error('Not implemented: getCurrentNetwork');
}

/**
 * Human-readable label for a wallet network state, for badges and notices.
 */
export function formatNetworkLabel(
  status: WalletNetworkState,
  name?: string | null
): string {
  throw new Error('Not implemented: formatNetworkLabel');
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
  throw new Error('Not implemented: assertActiveAccountMatches');
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

/* -------------------------------------------------------------------------- */
/* #471 — Real-time transaction status (SSE with polling fallback)             */
/* -------------------------------------------------------------------------- */

/** Default polling interval (ms) used when Server-Sent Events are not
 * available (e.g. offline first-load, jsdom, older browsers). */
const TRANSACTION_STATUS_POLL_MS = 5_000;

export interface TransactionStatusSubscription {
  /** True while the stream (EventSource) is connected. */
  connected: boolean;
  /** "sse" when the live stream is active, "polling" for the fallback. */
  transport: "sse" | "polling";
  /** Closes the stream and stops the polling timer. Safe to call twice. */
  unsubscribe: () => void;
}

/**
 * Base URL for the transaction status endpoint. Defaults to the app's own
 * `/api/transactions` route; override via NEXT_PUBLIC_TRANSACTION_STATUS_URL
 * when the API is hosted elsewhere (e.g. a separate serverless deployment).
 */
const TRANSACTION_STATUS_BASE_URL =
  process.env.NEXT_PUBLIC_TRANSACTION_STATUS_URL ?? "/api/transactions";

function getTransactionStatusUrl(hash: string, network: StellarNetwork): string {
  return `${TRANSACTION_STATUS_BASE_URL}/${encodeURIComponent(hash)}/status?network=${encodeURIComponent(network)}`;
}

/**
 * Subscribes to live status updates for a submitted transaction.
 *
 * Prefers an SSE stream (`/api/transactions/[hash]/status`). If EventSource is
 * unavailable or the stream errors, it transparently falls back to polling the
 * same endpoint every `pollIntervalMs`.
 *
 * While the tab is hidden the stream pauses (there is nobody to notify) and
 * resumes on focus, so a background tab never keeps an EventSource
 * reconnecting forever. The returned subscription is already active; call
 * `unsubscribe()` to close it. The stream also closes itself (and stops
 * polling) once the transaction reaches a terminal state ("confirmed" or
 * "failed"). (#471)
 */
export function subscribeToTransactionStatus(params: {
  hash: string;
  network: StellarNetwork;
  onStatus: (status: BridgeTransactionStatus) => void;
  onError?: (error: Error) => void;
  pollIntervalMs?: number;
}): TransactionStatusSubscription {
  const { hash, network, onStatus, onError } = params;
  const pollIntervalMs = params.pollIntervalMs ?? TRANSACTION_STATUS_POLL_MS;
  const url = getTransactionStatusUrl(hash, network);

  let stopped = false;
  let fellBack = false;
  let source: EventSource | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const stopPolling = () => {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const stopSource = () => {
    if (source) {
      source.close();
      source = null;
    }
  };

  const cleanup = () => {
    stopped = true;
    stopSource();
    stopPolling();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };

  const emit = (status: BridgeTransactionStatus) => {
    if (stopped) return;
    onStatus(status);
    // Terminal state: close the stream so the browser stops reconnecting.
    if (status === "confirmed" || status === "failed") cleanup();
  };

  const poll = async () => {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Transaction status request failed (${res.status})`);
      const payload = (await res.json()) as { status?: BridgeTransactionStatus };
      if (payload.status) emit(payload.status);
    } catch (e) {
      if (!stopped) onError?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      // Don't reschedule while the tab is hidden; focus restarts the timer.
      const visible =
        typeof document === "undefined" || document.visibilityState !== "hidden";
      if (!stopped && visible) pollTimer = setTimeout(() => void poll(), pollIntervalMs);
    }
  };

  const startPolling = () => {
    stopPolling();
    void poll();
  };

  // An EventSource failure is permanent — polling takes over from then on.
  // Pausing for a hidden tab is *not* a failure, so it doesn't set `fellBack`
  // and the stream can be re-created when the tab is focused again.
  const fallbackToPolling = () => {
    if (fellBack) return;
    fellBack = true;
    stopSource();
    startPolling();
  };

  const startSource = () => {
    if (stopped) return;
    try {
      source = new EventSource(url);
      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as { status?: BridgeTransactionStatus };
          if (payload.status) emit(payload.status);
        } catch {
          // Malformed frame — ignore; the next event may still be valid.
        }
      };
      // EventSource fires onerror for transient network failures too. Falling
      // back to polling on the *first* error keeps a broken stream from
      // silently stalling while it retries forever.
      source.onerror = () => fallbackToPolling();
    } catch {
      source = null;
      fallbackToPolling();
    }
  };

  // No one is watching a hidden tab, so pause the stream (and the fallback
  // timer) instead of reconnecting in the background; focusing resumes it. The
  // listener is only attached when `document` exists, so this only runs in the
  // browser. (#471)
  const handleVisibilityChange = () => {
    if (stopped) return;
    if (document.visibilityState === "hidden") {
      stopSource();
      stopPolling();
    } else if (fellBack) {
      startPolling();
    } else {
      startSource();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  if (typeof EventSource === "undefined") {
    startPolling();
    return { connected: false, transport: "polling", unsubscribe: cleanup };
  }

  startSource();
  const connected = source !== null && !fellBack;
  return {
    connected,
    transport: connected ? "sse" : "polling",
    unsubscribe: cleanup,
  };
}



/* -------------------------------------------------------------------------- */
/* #474 — Transaction detail lookup                                            */
/* -------------------------------------------------------------------------- */

export interface TransactionDetails {
  hash: string;
  network: StellarNetwork;
  status: BridgeTransactionStatus;
  createdAt: string | null;
  ledger: number | null;
  /** Ledger close time (ISO) for the block that included the tx, if known. */
  ledgerClosedAt: string | null;
  /** Actual fee charged, in stroops. */
  feeChargedStroops: number;
  /** Max fee bid when built, in stroops. */
  feeStroops: number;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  asset: string | null;
  memo: string | null;
  sequence: number | null;
}

/** Matches Horizon/Soroban transaction hashes (sha256 hex, 64 chars). */
const TRANSACTION_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Loads full details for a single transaction from Horizon.
 *
 * - Returns `null` when the hash is malformed (nothing with that id can ever
 *   exist).
 * - Returns a `pending` record when the hash is well-formed but Horizon does
 *   not know it yet — the transaction may still be in flight — so the detail
 *   page can show a "still processing" state and keep polling instead of a
 *   dead-end "not found". (#474)
 */
export async function getTransactionByHash(
  hash: string,
  network: StellarNetwork
): Promise<TransactionDetails | null> {
  if (!TRANSACTION_HASH_PATTERN.test(hash)) return null;

  const server = new Horizon.Server(HORIZON_URL[network]);
  let record: Horizon.ServerApi.TransactionRecord;
  try {
    record = await server.transactions().transaction(hash).call();
  } catch {
    // Not ingested yet → still in flight, not unknown.
    return {
      hash,
      network,
      status: "pending",
      createdAt: null,
      ledger: null,
      ledgerClosedAt: null,
      feeChargedStroops: 0,
      feeStroops: 0,
      fromAddress: null,
      toAddress: null,
      amount: null,
      asset: null,
      memo: null,
      sequence: null,
    };
  }

  let fromAddress: string | null = null;
  let toAddress: string | null = null;
  let amount: string | null = null;
  let asset: string | null = null;

  // Payment-like operations carry the two ends of the transfer. Best-effort:
  // a failed fetch of the operations page still renders the record above.
  try {
    const operations = await server.operations().forTransaction(hash).call();
    const payment = operations.records.find((op) => op.type === "payment");
    if (payment && payment.type === "payment") {
      fromAddress = payment.from ?? null;
      toAddress = payment.to ?? null;
      amount = payment.amount ?? null;
      asset = payment.asset_type === "native" ? "XLM" : (payment.asset_code ?? null);
    }
  } catch {
    // Ignore — the record itself is enough to render the detail page.
  }

  // fee_charged / max_fee are typed `number | string` (Horizon returns
  // strings). Normalise either shape to a number for display.
  const toStroops = (value: number | string | undefined): number => {
    const n = typeof value === "string" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  };
  // Best-effort ledger close time for the status timeline. The SDK types
  // LedgerCallBuilder#call() as CollectionPage even though a single-ledger call
  // returns the record itself, so read `closed_at` through a minimal shape.
  let ledgerClosedAt: string | null = null;
  if (record.ledger_attr != null) {
    try {
      const ledgerRecord = (await server
        .ledgers()
        .ledger(record.ledger_attr)
        .call()) as unknown as { closed_at?: string | null };
      ledgerClosedAt = ledgerRecord.closed_at ?? null;
    } catch {
      // Best-effort — the record alone is enough to render the detail page.
    }
  }
  const sequenceNumber = Number(record.source_account_sequence);

  return {
    hash: record.hash ?? hash,
    network,
    status: record.successful ? "confirmed" : "failed",
    createdAt: record.created_at ?? null,
    ledger: record.ledger_attr ?? null,
    ledgerClosedAt,
    feeChargedStroops: toStroops(record.fee_charged),
    feeStroops: toStroops(record.max_fee),
    fromAddress,
    toAddress,
    amount,
    asset,
    memo: record.memo ?? null,
    sequence: Number.isFinite(sequenceNumber) ? sequenceNumber : null,
  };
}
