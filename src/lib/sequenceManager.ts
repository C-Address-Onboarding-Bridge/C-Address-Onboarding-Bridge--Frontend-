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
  const now = Date.now();
  const entry = cache.get(key);

  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    // Increment in cache and return next sequence
    entry.sequence += 1n;
    return entry.sequence;
  }

  // Cache miss or expired — fetch from network
  const fetched = await fetchSequenceFromNetwork(accountId, server);
  // fetched is the current sequence; next transaction uses fetched + 1
  const nextSeq = fetched + 1n;
  cache.set(key, { sequence: nextSeq, fetchedAt: now });
  return nextSeq;
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
  if (error === null || error === undefined) return false;

  // Check Horizon error shape: error.response.data.extras.result_codes.transaction
  if (typeof error === "object") {
    const e = error as {
      response?: {
        data?: {
          extras?: {
            result_codes?: {
              transaction?: string;
            };
          };
        };
      };
    };
    const txCode = e.response?.data?.extras?.result_codes?.transaction;
    if (txCode === "tx_bad_seq") return true;
  }

  // Check error message
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("bad_seq") || msg.includes("tx_bad_seq")) return true;
  }

  return false;
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
    const getSequence = () => getNextSequenceNumber(accountId, server, network);

    try {
      return await fn(getSequence);
    } catch (err) {
      if (isBadSequenceError(err) && attempts < maxRetries) {
        attempts++;
        // Invalidate cache so next call re-fetches fresh sequence
        invalidateSequenceCache(accountId, network);
        // Apply backoff delay
        await new Promise<void>((resolve) =>
          setTimeout(resolve, RETRY_BACKOFF_MS * attempts)
        );
        continue;
      }
      throw err;
    }
  }
}
