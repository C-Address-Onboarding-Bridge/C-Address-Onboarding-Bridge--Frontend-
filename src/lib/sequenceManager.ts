import type { Horizon, rpc } from "@stellar/stellar-sdk";
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
  /** Last sequence number known to have been consumed on-chain (confirmed base). */
  baseSequence: bigint;
  fetchedAt: number;
  /**
   * Highest sequence number handed out by `getNextSequenceNumber` so far for
   * this (network, account). Reservations only ever move this forward, so two
   * concurrent callers get distinct, strictly increasing numbers (N, N+1, …)
   * instead of the same cached value. (#933)
   */
  highWaterMark: bigint;
  /** Sequence numbers that have been reserved but not yet committed or released. */
  pending: Set<bigint>;
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
 * Reserves and returns the next sequence number for the given account address
 * on the given network. Fetches from network if the cache is missing or
 * expired.
 *
 * Every call *reserves* a fresh, strictly increasing number by advancing an
 * in-memory high-water mark — it never hands the same number to two callers.
 * This is what lets a batch submission and a single payment (or a
 * double-clicked confirm button) build concurrently without colliding on the
 * same sequence. (#933 — previously, per #688, this returned the cached value
 * unchanged until a commit, so concurrent builders were both handed N and one
 * always failed with tx_bad_seq.)
 *
 * The caller must follow up with exactly one of:
 * - `commitSequenceNumber` once the transaction has actually consumed the
 *   sequence on-chain (success, or a `tx_failed` result envelope), or
 * - `releaseSequenceNumber` if the build was abandoned before submission
 *   (e.g. the wallet prompt was cancelled), so the number can be reused.
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
  let entry = cache.get(key);
  const now = Date.now();

  const needsRefetch = !entry || now - entry.fetchedAt >= CACHE_TTL_MS;

  if (needsRefetch) {
    const currentSequence = await fetchSequenceFromNetwork(accountId, server);
    // If reservations are still outstanding, the network's confirmed
    // sequence may legitimately lag behind what we've already handed out —
    // never move the high-water mark backwards underneath a pending build.
    const highWaterMark =
      entry && entry.pending.size > 0 && entry.highWaterMark > currentSequence
        ? entry.highWaterMark
        : currentSequence;
    entry = {
      baseSequence: currentSequence,
      fetchedAt: now,
      highWaterMark,
      pending: entry?.pending ?? new Set<bigint>(),
    };
    cache.set(key, entry);
  }

  entry.highWaterMark += 1n;
  entry.pending.add(entry.highWaterMark);
  return entry.highWaterMark;
}

/**
 * Confirms that a transaction consuming `sequence` reached the ledger —
 * either it succeeded, or Horizon returned a result envelope for it (e.g.
 * `tx_failed` from `op_underfunded`). Either way the sequence is burned
 * on-chain, so the cached base must advance past it or the next build will
 * be handed a number Horizon will reject as `tx_bad_seq`. (#933)
 *
 * If the cache entry is missing this is a no-op.
 *
 * @param accountId - Stellar public key whose sequence was consumed
 * @param network - The network the transaction was submitted to
 * @param sequence - The sequence number that was consumed on-chain
 */
export function commitSequenceNumber(
  accountId: string,
  network: StellarNetwork,
  sequence: bigint
): void {
  const key = cacheKey(accountId, network);
  const entry = cache.get(key);
  if (!entry) return;
  entry.pending.delete(sequence);
  if (entry.baseSequence < sequence) {
    entry.baseSequence = sequence;
  }
  if (entry.highWaterMark < sequence) {
    entry.highWaterMark = sequence;
  }
}

/**
 * Releases a reserved sequence number that was never submitted to the
 * network (e.g. the wallet prompt was cancelled, or the build errored before
 * reaching Horizon). The number is only reusable without risking a gap when
 * it was the *most recently* reserved one and nothing higher is still
 * outstanding — otherwise a higher reservation already depends on this
 * number having been consumed, so the high-water mark is left alone and the
 * number is simply dropped from the pending set. (#933)
 *
 * @param accountId - Stellar public key whose reservation should be released
 * @param network - The network the reservation was made on
 * @param sequence - The sequence number to release
 */
export function releaseSequenceNumber(
  accountId: string,
  network: StellarNetwork,
  sequence: bigint
): void {
  const key = cacheKey(accountId, network);
  const entry = cache.get(key);
  if (!entry) return;
  entry.pending.delete(sequence);
  if (entry.highWaterMark === sequence) {
    entry.highWaterMark = sequence - 1n;
  }
}

/**
 * Fetches the current sequence number from the network.
 * Returns the sequence as-is — caller must increment before using in a transaction.
 */
async function fetchSequenceFromNetwork(
  accountId: string,
  server: Horizon.Server | rpc.Server
): Promise<bigint> {
  if ("getAccount" in server && typeof server.getAccount === "function") {
    const account = await server.getAccount(accountId);
    return BigInt(account.sequenceNumber());
  } else {
    const account = await (server as Horizon.Server).loadAccount(accountId);
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
 * Returns true if `error` carries a Horizon result envelope for the
 * transaction — i.e. the transaction actually reached the ledger and was
 * processed (e.g. `tx_failed` from `op_underfunded`), as opposed to being
 * rejected before entering the ledger (`tx_bad_seq`) or never submitted at
 * all (a wallet rejection, a network error building the request, etc).
 *
 * A transaction that reached the ledger consumes its sequence number even
 * when it fails, so callers must still commit — not release — in this case,
 * or the next build will reuse a sequence Horizon has already burned and get
 * tx_bad_seq. (#933)
 */
export function wasSubmittedToLedger(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const e = error as Record<string, unknown>;
  if (typeof e.response !== "object" || e.response === null) return false;

  const resp = e.response as Record<string, unknown>;
  const data = resp.data as Record<string, unknown> | undefined;
  const extras = data?.extras as Record<string, unknown> | undefined;
  const resultCodes = extras?.result_codes as Record<string, unknown> | undefined;
  const transactionCode = resultCodes?.transaction;

  // tx_bad_seq / tx_too_late are rejected by Horizon before the transaction
  // is applied, so no result envelope for the ledger is produced and the
  // sequence was never consumed.
  if (!transactionCode) return false;
  return transactionCode !== "tx_bad_seq" && transactionCode !== "tx_too_late";
}

/**
 * Wraps a transaction submission function with automatic bad_seq recovery.
 * On bad_seq error: invalidates cache for the account and retries once.
 *
 * The sequence number is reserved up front via `getNextSequenceNumber` and
 * then either committed (success, or a ledger result envelope like
 * `tx_failed` — see `wasSubmittedToLedger`) or released (the build never
 * reached the ledger, e.g. the wallet prompt was cancelled) once `fn`
 * settles, so the cache never serves the same number to two callers and
 * never leaves a permanent gap for a cancelled build. (#933, replacing the
 * #688 behaviour where the cache was simply left untouched on any error)
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
    let usedSequence: bigint | undefined;
    try {
      const getSequence = async () => {
        const sequence = await getNextSequenceNumber(accountId, server, network);
        usedSequence = sequence;
        return sequence;
      };
      const result = await fn(getSequence);
      // Advance the cached base past the sequence that was actually consumed.
      if (usedSequence !== undefined) {
        commitSequenceNumber(accountId, network, usedSequence);
      }
      return result;
    } catch (error) {
      if (isBadSequenceError(error) && attempts < maxRetries) {
        attempts++;
        // Rejected before reaching the ledger — the sequence was never
        // consumed, so release it rather than leaving it permanently burned.
        if (usedSequence !== undefined) {
          releaseSequenceNumber(accountId, network, usedSequence);
        }
        invalidateSequenceCache(accountId, network);
        // Small delay before retry to avoid thundering herd
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * attempts));
        continue;
      }
      if (usedSequence !== undefined) {
        if (wasSubmittedToLedger(error)) {
          // The transaction reached the ledger (e.g. tx_failed) and burned
          // its sequence even though it failed — commit, don't release.
          commitSequenceNumber(accountId, network, usedSequence);
        } else {
          // Never reached the ledger (wallet rejection, network error
          // building/sending the request, etc) — safe to reuse the number.
          releaseSequenceNumber(accountId, network, usedSequence);
        }
      }
      throw error;
    }
  }
}
