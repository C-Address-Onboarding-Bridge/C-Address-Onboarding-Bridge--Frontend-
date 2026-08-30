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
      `NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC is not configured. ` +
      `SDF does not operate a free public mainnet Soroban RPC — set this to your own provider's URL.`
    );
  }
  return new rpc.Server(url);
}

export async function getNetworkPassphrase(network: StellarNetwork): Promise<string> {
  if (network === "PUBLIC") {
    return Networks.PUBLIC;
  }
  return Networks.TESTNET;
}

export async function connectWallet(): Promise<string | null> {
  const connected = await isConnected();
  if (!connected) return null;
  const result = await getAddress();
  if ("error" in result && result.error) return null;
  return (result as { address: string }).address ?? null;
}

export async function checkConnection(): Promise<boolean> {
  try {
    const result = await isConnected();
    if (typeof result === 'boolean') return result;
    if (typeof result === 'object' && result !== null) {
      return !!(result as { isConnected: boolean }).isConnected;
    }
    return false;
  } catch {
    return false;
  }
}

export async function getWalletAddress(): Promise<string | null> {
  try {
    const result = await getAddress();
    if ("error" in result && result.error) return null;
    return (result as { address: string }).address ?? null;
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
    // Check for in-band error
    if ("error" in result && result.error) {
      return { status: "UNKNOWN", name: null };
    }
    const raw = (result as { network: string }).network;
    if (!raw) {
      return { status: "UNKNOWN", name: null };
    }
    const upper = raw.toUpperCase();
    if (upper === "PUBLIC" || upper === "TESTNET") {
      return { status: upper as WalletNetworkState, name: upper };
    }
    return { status: "UNSUPPORTED", name: upper };
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
  switch (status) {
    case "PUBLIC":
      return "Mainnet";
    case "TESTNET":
      return "Testnet";
    case "UNSUPPORTED":
      if (name) {
        // Capitalise: FUTURENET -> Futurenet
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      }
      return "Unsupported";
    case "UNKNOWN":
      return "Unknown";
  }
}

// Validate against the SDK's StrKey, which enforces the correct base32
// alphabet (A-Z, 2-7 — no 0/1/8/9) and the trailing CRC16 checksum. A
// hand-rolled regex cannot verify the checksum and, as [G|C] showed, is easy
// to get subtly wrong (that character class also accepted a leading '|').
export function isValidStellarAddress(address: string): boolean {
  if (!address) return false;
  try {
    return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address);
  } catch {
    return false;
  }
}

export function isValidStellarAmount(amount: string): boolean {
  if (!amount) return false;
  // Must be a positive number with at most 7 decimal places
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) return false;
  const num = parseFloat(amount);
  if (!Number.isFinite(num) || num <= 0) return false;
  return true;
}

export function isCAddress(address: string): boolean {
  if (!address) return false;
  try {
    return StrKey.isValidContract(address);
  } catch {
    return false;
  }
}

export function isGAddress(address: string): boolean {
  if (!address) return false;
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
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
  const key = `${address}:${network}`;
  const now = Date.now();
  const entry = balanceCache.get(key);

  if (entry && now - entry.fetchedAt < BALANCE_CACHE_TTL_MS) {
    // Return cached promise (deduplicates concurrent requests too)
    return withBalanceFallback(entry.promise);
  }

  // Create a new in-flight promise and cache it immediately for deduplication
  const promise = loadAccountBalances(address, network);
  balanceCache.set(key, { promise, fetchedAt: now });

  // On failure, evict the cache entry so next call retries
  const result = await withBalanceFallback(promise.catch((err) => {
    // Evict failed entry from cache
    const current = balanceCache.get(key);
    if (current && current.promise === promise) {
      balanceCache.delete(key);
    }
    throw err;
  }));

  return result;
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
  try {
    const server = await getHorizonServer(network);
    const payments = await (server as unknown as {
      payments: (opts: { limit: number }) => {
        forAccount: (addr: string) => {
          order: (o: string) => {
            call: () => Promise<{ records: HorizonPayment[] }>;
          };
        };
      };
    }).payments({ limit }).forAccount(address).order("desc").call();

    return payments.records.map((p: HorizonPayment) => {
      const amount = p.amount ?? p.starting_balance ?? "0";
      const asset = p.asset_type === "native" ? "XLM" : (p.asset_code ?? "unknown");
      const status: BridgeTransactionStatus =
        p.transaction_successful === true
          ? "confirmed"
          : p.transaction_successful === false
          ? "failed"
          : "pending";

      return {
        id: p.id,
        fromAddress: p.from ?? p.funder ?? "",
        toAddress: p.to ?? p.account ?? "",
        amount,
        asset,
        status,
        timestamp: p.created_at ? new Date(p.created_at).getTime() : 0,
        type: "g-to-c",
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
      //
      // We call getNetwork() directly (rather than getCurrentNetwork()) so we
      // can distinguish:
      //   a) getNetwork returns undefined (test mock not set up, or extension
      //      returned no data) → treat as "can't verify, proceed"
      //   b) getNetwork returns a different known network → abort
      //   c) getNetwork rejects (Freighter locked, etc.) → abort with UNKNOWN
      try {
        const netResult = await getNetwork();
        if (netResult !== undefined && netResult !== null && typeof netResult === "object") {
          // Check for in-band error (e.g. user declined access)
          if ("error" in netResult && (netResult as { error?: unknown }).error) {
            throw new Error(
              `Network changed in Freighter — please retry. ` +
              `Transaction was built for ${network} but Freighter is now on UNKNOWN.`
            );
          }
          // Compare the actual reported network
          const reportedRaw = (netResult as { network?: string }).network;
          const reported = (reportedRaw ?? "").toUpperCase() as WalletNetworkState;
          if (reported && reported !== network) {
            throw new Error(
              `Network changed in Freighter — please retry. ` +
              `Transaction was built for ${network} but Freighter is now on ${reported}.`
            );
          }
        }
        // If netResult is undefined/null, we can't verify the network — proceed
      } catch (networkErr) {
        // Re-throw errors we raised ourselves
        if (networkErr instanceof Error && networkErr.message.includes("Network changed in Freighter")) {
          throw networkErr;
        }
        // getNetwork() itself rejected (Freighter locked, locked extension, etc.)
        throw new Error(
          `Network changed in Freighter — please retry. ` +
          `Transaction was built for ${network} but Freighter is now on UNKNOWN.`
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
          "Wallet returned an unexpected response while signing — the signed transaction data is missing or empty."
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
  if (error instanceof Error) {
    const msg = error.message;
    // Short, human-written messages are safe to show directly
    if (msg && msg.length < 200 && !msg.includes("{") && !msg.includes("xdr")) {
      return msg;
    }
    // Log the full error for debugging
    console.error("Error details (not shown to user):", error);
    return fallback;
  }
  if (typeof error === "string" && error.length < 200) {
    return error;
  }
  console.error("Error details (not shown to user):", error);
  return fallback;
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
  let activeAddress: string;
  try {
    const result = await getAddress();
    if ("error" in result && result.error) {
      throw new Error(result.error as string);
    }
    activeAddress = (result as { address: string }).address;
  } catch (e) {
    throw new Error(
      `Couldn't read Freighter's active account: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (activeAddress !== sourceAddress) {
    throw new Error(
      `Freighter's active account (${truncateAddress(activeAddress)}) doesn't match the From address ` +
      `(${truncateAddress(sourceAddress)}). Switch to the correct account in Freighter and retry.`
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
  // #287: Validate the source matches Freighter's active account before building
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
  return `${base}/${type}/${id}`;
}

export function getAccountMinimumBalance(): string {
  // Stellar minimum balance: 2 base reserves (0.5 XLM each) = 1 XLM
  return "1";
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
  try {
    const server = await getHorizonServer(network);
    const baseFee = await server.fetchBaseFee();
    const bid = Math.min(baseFee * 2, 10_000);
    return String(bid);
  } catch {
    return String(Number(BASE_FEE) * 2);
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
  return `~${xlm.toFixed(7)} XLM`;
}

/**
 * Validates that the source account is Freighter's active account.
 * Alias for assertActiveAccountMatches for external callers.
 */
export async function validateSourceAccount(
  from: string,
  _network: StellarNetwork
): Promise<void> {
  await assertActiveAccountMatches(from);
}
