/**
 * API client for the C-Address Bridge backend (#498).
 *
 * Handles health checks, transaction submission, and status polling.
 */
import type { StellarNetwork } from "./types";

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    horizon: 'up' | 'down' | 'degraded';
    soroban_rpc: 'up' | 'down' | 'degraded';
    api: 'up' | 'down' | 'degraded';
  };
  circuitBreakers?: {
    [key: string]: {
      state: 'closed' | 'open' | 'half-open';
      failures: number;
      lastFailure?: string;
    };
  };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com';

/**
 * Fetch the current health status from the API.
 * Returns null if the request fails.
 */
export async function getHealthStatus(): Promise<HealthStatus | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as HealthStatus;
  } catch (error) {
    console.error('Failed to fetch health status:', error);
    return null;
  }
}

/**
 * Determine if a service is experiencing issues based on health status.
 */
export function isServiceDegraded(health: HealthStatus | null): boolean {
  if (!health) return false;
  return health.status === 'degraded' || health.status === 'unhealthy';
}

/**
 * Get a human-readable message about service status.
 */
export function getStatusMessage(health: HealthStatus | null): string | null {
  if (!health) return null;

  switch (health.status) {
    case 'healthy':
      return null;
    case 'degraded':
      const degradedServices = Object.entries(health.services)
        .filter(([, status]) => status !== 'up')
        .map(([name]) => name.replace(/_/g, ' '));
      return `Service degradation detected: ${degradedServices.join(', ')}. Features may be slower.`;
    case 'unhealthy':
      return 'Service is currently unavailable. Please try again later.';
    default:
      return null;
  }
}

export interface BatchFundingRecipient {
  address: string;
  amount: string;
}

export interface BatchFundingRecipientResult extends BatchFundingRecipient {
  success: boolean;
  /** Transaction hash, present when `success` is true. */
  hash?: string;
  /** Failure reason, present when `success` is false. */
  error?: string;
}

export interface BatchFundingResponse {
  results: BatchFundingRecipientResult[];
}

/**
 * Submits a batch of C-address funding recipients to the batch endpoint,
 * which invokes the contract's `batch_fund_c_address` on the backend (#465).
 *
 * Resolves with one result per recipient — including partial failure, where
 * some recipients succeed and others don't — as long as the request itself
 * reaches the API. Throws only when the request as a whole cannot be
 * completed (network failure, non-2xx response), since at that point no
 * per-recipient results exist to report.
 */
export async function submitBatchFunding(
  fromAddress: string,
  recipients: BatchFundingRecipient[],
  network: StellarNetwork
): Promise<BatchFundingResponse> {
  const response = await fetch(`${API_BASE_URL}/batch-fund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress, network, recipients }),
  });

  if (!response.ok) {
    let message = `Batch funding request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body && typeof body.error === "string" && body.error) {
        message = body.error;
      }
    } catch {
      // Response body wasn't JSON (or empty) — keep the generic status message.
    }
    throw new Error(message);
  }

  return (await response.json()) as BatchFundingResponse;
}

/**
 * Timelocked funding & claims routes (#467).
 *
 * PLACEHOLDER INTERFACE: see `src/lib/locks.ts` for why — no contract source
 * or lock API route exists anywhere in this repo to build against yet. The
 * routes/status codes below (`POST /locks`, `GET /locks?recipient=`,
 * `POST /locks/:id/claim`, a 409 for an already-claimed lock) are a
 * best-guess shape and must be reconciled against the real API once it
 * lands.
 */

/** Thrown by `claimLock` when the lock was already claimed — e.g. from another device. */
export class LockAlreadyClaimedError extends Error {
  constructor(message = "This lock has already been claimed.") {
    super(message);
    this.name = "LockAlreadyClaimedError";
  }
}

async function extractApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body && typeof body.error === "string" && body.error) {
      return body.error;
    }
  } catch {
    // Response body wasn't JSON (or empty) — keep the generic status message.
  }
  return fallback;
}

export interface CreateLockParams {
  from: string;
  recipient: string;
  amount: string;
  asset: string;
  /** Epoch milliseconds. */
  unlockTime: number;
  network: StellarNetwork;
}

/** Creates a new timelocked transfer. */
export async function createLock(params: CreateLockParams): Promise<Lock> {
  const response = await fetch(`${API_BASE_URL}/locks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, `Lock creation failed (${response.status})`));
  }
  return (await response.json()) as Lock;
}

/** Lists locks incoming to `recipient` — both pending and already-claimed. */
export async function listIncomingLocks(recipient: string, network: StellarNetwork): Promise<Lock[]> {
  const response = await fetch(
    `${API_BASE_URL}/locks?recipient=${encodeURIComponent(recipient)}&network=${encodeURIComponent(network)}`
  );

  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, `Failed to load locks (${response.status})`));
  }
  const body = (await response.json()) as { locks: Lock[] };
  return body.locks;
}

/**
 * Claims a matured lock on behalf of `claimant`. Throws
 * {@link LockAlreadyClaimedError} on a 409 response — the shape of
 * "someone else (or another session) already claimed this" — so callers can
 * distinguish it from a generic failure and reconcile their view instead of
 * just showing a retryable error.
 */
export async function claimLock(lockId: string, claimant: string, network: StellarNetwork): Promise<Lock> {
  const response = await fetch(`${API_BASE_URL}/locks/${encodeURIComponent(lockId)}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claimant, network }),
  });

  if (response.status === 409) {
    throw new LockAlreadyClaimedError(await extractApiErrorMessage(response, "This lock has already been claimed."));
  }
  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, `Claim failed (${response.status})`));
  }
  return (await response.json()) as Lock;
}

/**
 * Fee tier preview (#468).
 *
 * PLACEHOLDER INTERFACE: see `src/lib/feeTiers.ts` for why — no contract
 * source or tier API route exists anywhere in this repo to build against
 * yet. The route (`GET /fee-tiers/preview?address=&network=`) and response
 * shape are a best-guess and must be reconciled against the real API once it
 * lands.
 *
 * Returns null both when the account has no tier data yet and when the
 * request itself fails — callers treat "no data" as "hide the tier display"
 * either way (#468), so a transient fetch failure degrades to the same
 * silent-hide behavior as tiers genuinely not being configured, rather than
 * surfacing an error for what is supplementary information.
 */
export async function getFeeTierPreview(address: string, network: StellarNetwork): Promise<FeeTierStatus | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/fee-tiers/preview?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`
    );
    if (!response.ok) return null;
    return (await response.json()) as FeeTierStatus | null;
  } catch (error) {
    console.error('Failed to fetch fee tier preview:', error);
    return null;
  }
}

/**
 * Distinguish if an error is service-related, wallet-related, or user error.
 */
export function classifyError(error: unknown, health: HealthStatus | null) {
  const errorStr = String(error);

  // Service errors
  if (isServiceDegraded(health)) {
    if (
      errorStr.includes('timeout') ||
      errorStr.includes('connection') ||
      errorStr.includes('network')
    ) {
      return {
        type: 'service' as const,
        message: 'Service is experiencing issues. Please try again soon.',
      };
    }
  }

  // Wallet errors
  if (
    errorStr.includes('wallet') ||
    errorStr.includes('freighter') ||
    errorStr.includes('not connected')
  ) {
    return {
      type: 'wallet' as const,
      message: 'Please check your wallet connection and try again.',
    };
  }

  // Network errors
  if (errorStr.includes('network') || errorStr.includes('offline')) {
    return {
      type: 'network' as const,
      message: 'Network issue detected. Please check your connection.',
    };
  }

  // User/validation errors
  if (
    errorStr.includes('invalid') ||
    errorStr.includes('insufficient') ||
    errorStr.includes('balance')
  ) {
    return {
      type: 'user' as const,
      message: String(error),
    };
  }

  // Default to service error if we're degraded
  if (isServiceDegraded(health)) {
    return {
      type: 'service' as const,
      message: 'An error occurred. The service may be experiencing issues.',
    };
  }

  return {
    type: 'unknown' as const,
    message: 'An unexpected error occurred. Please try again.',
  };
}
