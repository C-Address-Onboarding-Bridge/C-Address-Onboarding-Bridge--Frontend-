import { Horizon, rpc } from "@stellar/stellar-sdk";
import type { StellarNetwork } from "./types";

/**
 * Manages Stellar account sequence numbers to prevent bad_seq errors.
 *
 * Strategy:
 * - Cache the sequence number per (network, account) after each fetch
 * - Increment locally for consecutive transactions without re-fetching
 * - Invalidate cache and re-fetch on bad_seq errors
 * - Re-fetch if cache is older than CACHE_TTL_MS
 */

const CACHE_TTL_MS = 30_000; // 30 seconds

/** Base delay multiplied by attempt count on bad_seq retries. */
const RETRY_BACKOFF_MS = 200;

interface SequenceEntry {
  sequence: bigint;
  fetchedAt: number;
}

const cache = new Map<string, SequenceEntry>();

/**
 * The same G-address exists independently on testnet and mainnet with entirely
 * unrelated sequence numbers, so the network has to be part of the cache key.
 * Keying on the address alone meant switching Freighter between networks within
 * the 30s TTL served (and incremented) the *other* chain's sequence, producing
 * intermittent tx_bad_seq failures. (#290)
 */
function cacheKey(accountId: string, network: StellarNetwork): string {
  return `${network}:${accountId}`;
}

/**
 * Returns the next sequence number for the given account address on the given
 * network. Fetches from network if cache is missing or expired.
 * Increments the cached value for subsequent calls within TTL.
 *
 * @param accountId - Stellar public key (G... address)
 * @param server - Horizon or SorobanRpc server instance
 * @param network - The network `server` points at ("PUBLIC" or "TESTNET")
 */
export async function getNextSequenceNumber(
  accountId: string,
  server: Horizon.Server | rpc.Server,
  network: StellarNetwork
): Promise<bigint> {
  const key = cacheKey(accountId, network);
  const entry = cache.get(key);
  const now = Date.now();

  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    // Increment cached sequence for this transaction
    entry.sequence += 1n;
    return entry.sequence;
  }

  // Cache miss or expired — fetch from network
  const currentSequence = await fetchSequenceFromNetwork(accountId, server);
  const nextSequence = currentSequence + 1n;
  cache.set(key, { sequence: nextSequence, fetchedAt: now });
  return nextSequence;
}

/**
 * Fetches the current sequence number from the network.
 * Returns the sequence as-is — caller must increment before using in a transaction.
 */
async function fetchSequenceFromNetwork(
  accountId: string,
  server: Horizon.Server | rpc.Server
): Promise<bigint> {
  if (server instanceof rpc.Server) {
    const account = await server.getAccount(accountId);
    return BigInt(account.sequenceNumber());
  } else {
    const account = await server.loadAccount(accountId);
    return BigInt(account.sequenceNumber());
  }
}

/**
 * Invalidates the cached sequence number for an account on a single network.
 * Call this when a bad_seq error is received so the next call re-fetches.
 *
 * Only the (network, account) pair is dropped — the same address's entry on the
 * other network is untouched, since the two sequences are unrelated. (#290)
 *
 * @param accountId - Stellar public key to invalidate
 * @param network - The network whose entry should be dropped
 */
export function invalidateSequenceCache(
  accountId: string,
  network: StellarNetwork
): void {
  cache.delete(cacheKey(accountId, network));
}

/**
 * Clears the entire sequence cache.
 * Use sparingly — prefer invalidateSequenceCache for targeted invalidation.
 */
export function clearAllSequenceCache(): void {
  cache.clear();
}

/**
 * Returns true if the error is a Stellar bad_seq error.
 * Handles both Horizon and SorobanRpc error shapes.
 */
export function isBadSequenceError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const e = error as Record<string, unknown>;

  // Horizon error shape
  if (typeof e.response === "object" && e.response !== null) {
    const resp = e.response as Record<string, unknown>;
    const data = resp.data as Record<string, unknown> | undefined;
    const extras = data?.extras as Record<string, unknown> | undefined;
    const resultCodes = extras?.result_codes as Record<string, unknown> | undefined;

    if (resultCodes?.transaction === "tx_bad_seq") return true;
  }

  // String error message fallback
  const msg = String(e.message ?? "");
  return msg.includes("bad_seq") || msg.includes("tx_bad_seq");
}

/**
 * Wraps a transaction submission function with automatic bad_seq recovery.
 * On bad_seq error: invalidates cache for the account and retries once.
 *
 * @param accountId - The account whose sequence to manage
 * @param fn - Async function that builds and submits a transaction.
 *             Receives a getSequence function it should call to get the sequence.
 * @param server - Stellar server instance for re-fetching
 * @param network - The network `server` points at ("PUBLIC" or "TESTNET")
 * @param maxRetries - Maximum number of retries on bad_seq (default: 1)
 */
export async function withSequenceRetry<T>(
  accountId: string,
  fn: (getSequence: () => Promise<bigint>) => Promise<T>,
  server: Horizon.Server | rpc.Server,
  network: StellarNetwork,
  maxRetries = 1
): Promise<T> {
  let attempts = 0;

  while (true) {
    try {
      const getSequence = () => getNextSequenceNumber(accountId, server, network);
      return await fn(getSequence);
    } catch (error) {
      if (isBadSequenceError(error) && attempts < maxRetries) {
        attempts++;
        invalidateSequenceCache(accountId, network);
        // Small delay before retry to avoid thundering herd
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * attempts));
        continue;
      }
      throw error;
    }
  }
}
