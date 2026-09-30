/**
 * API client for the C-Address Bridge backend (#498).
 *
 * Handles health checks, transaction submission, and status polling.
 */
import type { BridgeTransactionData, StellarNetwork } from "./types";
import { buildFeeTierStatus, type FeeTierStatus } from "./feeTiers";
import { getRebateVolume } from "./stellar";
// NOTE(ci-cleanup): without this, `Lock` silently resolved to the DOM Web Locks
// API type from lib.dom, so every lock field access failed to typecheck.
import type { Lock } from "./locks";
import type { ReferralStats } from "./referrals";
import type { ClaimProof } from "./stellar";

type ServiceState = 'up' | 'down' | 'degraded';
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * UI-facing health model (#670).
 *
 * The backend's actual `GET /health` response is `{ status: 'ok' | 'degraded'
 * | 'unhealthy', dependencies: {...}, circuits: {...} }` — not the
 * `{ status: 'healthy' | ..., services: {...}, circuitBreakers }` shape this
 * type used to mirror directly. `parseHealthResponse` below maps the real
 * response into this stable shape, so this interface (and everything reading
 * it) keeps its original field names regardless of the backend's own naming.
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string | null;
  services: Record<string, ServiceState>;
  circuitBreakers: Record<string, { state: CircuitState; failures: number; lastFailure?: string }>;
}

/**
 * Resolves the backend API's base URL (#675).
 *
 * Every function below already swallows its own request failures (#498) —
 * that's correct for a transient network blip, but it also meant a
 * production deploy that forgot NEXT_PUBLIC_API_URL silently sent every
 * request to a domain this project doesn't control, with nothing ever
 * surfacing the misconfiguration (the health banner would just quietly show
 * nothing). Throws immediately instead, but only when NODE_ENV is actually
 * 'production' — local dev and test runs keep the harmless fallback so
 * nobody needs this var set just to run `npm test`.
 *
 * Every page that transitively imports this module gets evaluated during
 * `next build`'s static-generation step, so this throw fails the build
 * itself for a production build, not just the first request at runtime.
 */
function resolveApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Set it in your production environment before building/deploying — ' +
        'without it, every API call silently targets a domain this project does not control.'
    );
  }
  return 'https://api.example.com';
}

// Exported so the server-only proxy routes under src/app/api/backend/ (#674)
// can forward to the same backend without re-resolving/re-validating this.
export const API_BASE_URL = resolveApiBaseUrl();

const SERVICE_STATES: ServiceState[] = ['up', 'down', 'degraded'];
const CIRCUIT_STATES: CircuitState[] = ['closed', 'open', 'half-open'];

function isServiceState(value: unknown): value is ServiceState {
  return typeof value === 'string' && (SERVICE_STATES as string[]).includes(value);
}

/** Backend field names for individual dependencies aren't guaranteed, so every key is kept as-is. */
function parseServiceMap(value: unknown): Record<string, ServiceState> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, ServiceState> = {};
  for (const [key, state] of Object.entries(value as Record<string, unknown>)) {
    if (isServiceState(state)) result[key] = state;
  }
  return result;
}

function parseCircuitMap(value: unknown): HealthStatus['circuitBreakers'] {
  if (!value || typeof value !== 'object') return {};
  const result: HealthStatus['circuitBreakers'] = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const { state, failures, lastFailure } = entry as Record<string, unknown>;
    if (!CIRCUIT_STATES.includes(state as CircuitState)) continue;
    result[key] = {
      state: state as CircuitState,
      failures: typeof failures === 'number' ? failures : 0,
      lastFailure: typeof lastFailure === 'string' ? lastFailure : undefined,
    };
  }
  return result;
}

/**
 * Validates and maps a raw `GET /health` response into `HealthStatus`.
 * Never throws: an unrecognized or malformed shape degrades to `unhealthy`
 * with empty service/circuit maps rather than crashing the status banner —
 * a shape we can't parse is itself worth surfacing as unhealthy.
 */
export function parseHealthResponse(data: unknown): HealthStatus | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const status = raw.status === 'ok' || raw.status === 'healthy' ? 'healthy' : raw.status === 'degraded' ? 'degraded' : 'unhealthy';
  return {
    status,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : null,
    services: parseServiceMap(raw.dependencies),
    circuitBreakers: parseCircuitMap(raw.circuits),
  };
}

/**
 * Synthesized health status used when the health endpoint is completely
 * unreachable (network error or non-2xx response). Reporting `unhealthy`
 * here — rather than `null` — is what makes the service-status banner
 * appear during a total outage (#710).
 */
function unreachableHealthStatus(): HealthStatus {
  return {
    status: 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      horizon: 'down',
      soroban_rpc: 'down',
      api: 'down',
    },
  };
}

/**
 * Fetch the current health status from the API.
 *
 * Retries once on failure. If the health endpoint is still unreachable after
 * the retry, resolves with an `unhealthy` status (rather than `null`) so
 * callers surface the outage banner instead of silently showing nothing.
 */
export async function getHealthStatus(): Promise<HealthStatus | null> {
  const attempt = async (): Promise<HealthStatus> => {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Health check failed (${response.status})`);
    }

    return parseHealthResponse(await response.json());
  } catch (error) {
    console.error('Failed to fetch health status, retrying:', error);
  }

  try {
    return await attempt();
  } catch (error) {
    console.error('Failed to fetch health status after retry:', error);
    return unreachableHealthStatus();
  }
}

/**
 * Fetch referral statistics for an account. The endpoint is a placeholder
 * until the referral API contract is finalized; failures return null so the
 * page can offer its retry state instead of crashing.
 */
export async function getReferralStats(
  address: string,
  network: StellarNetwork
): Promise<ReferralStats | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/referrals/${encodeURIComponent(address)}?network=${encodeURIComponent(network)}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    if (!response.ok) return null;
    return (await response.json()) as ReferralStats;
  } catch {
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
    case 'degraded': {
      const degradedServices = Object.entries(health.services)
        .filter(([, status]) => status !== 'up')
        .map(([name]) => name.replace(/_/g, ' '));
      return degradedServices.length > 0
        ? `Service degradation detected: ${degradedServices.join(', ')}. Features may be slower.`
        : 'Service degradation detected. Features may be slower.';
    }
    case 'unhealthy':
      return 'Service is currently unavailable. Please try again later.';
    default:
      return null;
  }
}

/**
 * Error categories surfaced to the UI so callers can render a targeted
 * message instead of a generic "something went wrong".
 */
export type ErrorCategory = 'wallet' | 'network' | 'service' | 'unknown';

/**
 * Classifies an error into a coarse category for user-facing messaging.
 *
 * Classification is case-insensitive and matches on typed error names/codes
 * first, then on message substrings, so messages like "Freighter's active
 * account…" or "Network changed in Freighter…" are categorized correctly
 * rather than falling through to `unknown`.
 */
export function classifyError(error: unknown): ErrorCategory {
  const name = error instanceof Error ? error.name : '';
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const message = error instanceof Error ? error.message : String(error);
  const haystack = `${name} ${code} ${message}`.toLowerCase();

  // Wallet errors take precedence: a wallet failure can mention "network"
  // (e.g. "Network changed in Freighter") without being a network error.
  if (
    haystack.includes('wallet') ||
    haystack.includes('freighter') ||
    haystack.includes('user rejected') ||
    haystack.includes('user denied') ||
    haystack.includes('rejected by user') ||
    haystack.includes('not connected') ||
    haystack.includes('no account')
  ) {
    return 'wallet';
  }

  if (
    haystack.includes('network') ||
    haystack.includes('timeout') ||
    haystack.includes('timed out') ||
    haystack.includes('offline') ||
    haystack.includes('fetch failed') ||
    haystack.includes('failed to fetch')
  ) {
    return 'network';
  }

  if (
    haystack.includes('service') ||
    haystack.includes('unavailable') ||
    haystack.includes('horizon') ||
    haystack.includes('soroban') ||
    haystack.includes('rpc') ||
    haystack.includes('500') ||
    haystack.includes('502') ||
    haystack.includes('503')
  ) {
    return 'service';
  }

  return 'unknown';
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

export interface PreparedBatchFunding {
  /** Unsigned transaction XDR invoking the contract's batch_fund_c_address, built server-side. */
  xdr: string;
}

/**
 * Asks the backend to build (but not submit) the `batch_fund_c_address`
 * invocation for these recipients, returning an unsigned transaction XDR for
 * the wallet to sign (#671).
 *
 * PLACEHOLDER ENDPOINT: no contract ABI/bindings for batch_fund_c_address
 * exist in this repo, so the invocation can't be built client-side with any
 * confidence in the argument encoding. `POST /api/v1/fund/batch` (the
 * confirmed submit endpoint, see submitSignedBatchFunding below) implies a
 * prepare step must exist somewhere to produce the XDR it accepts, but this
 * exact path/body is a best guess and must be reconciled against the real
 * API once it's documented.
 */
export async function prepareBatchFunding(
  fromAddress: string,
  recipients: BatchFundingRecipient[],
  network: StellarNetwork
): Promise<PreparedBatchFunding> {
  const response = await fetch(`${API_BASE_URL}/api/v1/fund/batch/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress, network, recipients }),
  });

  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, `Batch preparation failed (${response.status})`));
  }

  const body = (await response.json()) as Partial<PreparedBatchFunding>;
  if (typeof body.xdr !== "string" || !body.xdr) {
    throw new Error("Batch preparation response was missing the transaction to sign.");
  }
  return { xdr: body.xdr };
}

/**
 * Submits a wallet-signed `batch_fund_c_address` transaction to the real
 * batch endpoint (#671). Resolves with one result per recipient — including
 * partial failure, where some recipients succeed and others don't — as long
 * as the request itself reaches the API. Throws only when the request as a
 * whole cannot be completed (network failure, non-2xx response), since at
 * that point no per-recipient results exist to report.
 */
export async function submitSignedBatchFunding(
  signedXdr: string,
  network: StellarNetwork
): Promise<BatchFundingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/fund/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ signedXdr, network }),
  });

  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, `Batch funding request failed (${response.status})`));
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
  const response = await fetch(`/api/backend/locks`, {
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
    `/api/backend/locks?recipient=${encodeURIComponent(recipient)}&network=${encodeURIComponent(network)}`
  );

  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, `Failed to load locks (${response.status})`));
  }
  const body = (await response.json()) as { locks: Lock[] };
  return body.locks;
}

/**
 * Claims a matured lock on behalf of `claimant`. `proof` — a wallet-signed
 * challenge from `signClaimProof` in src/lib/stellar.ts — establishes that
 * the caller actually controls `claimant`; the previous version sent only
 * `{ claimant, network }`, an unauthenticated claim anyone could submit for
 * any address (#672). The exact proof fields the backend expects are a best
 * guess pending the real API (see signClaimProof's own doc comment).
 *
 * Throws {@link LockAlreadyClaimedError} on a 409 response — the shape of
 * "someone else (or another session) already claimed this" — so callers can
 * distinguish it from a generic failure and reconcile their view instead of
 * just showing a retryable error.
 */
export async function claimLock(
  lockId: string,
  claimant: string,
  network: StellarNetwork,
  proof: ClaimProof
): Promise<Lock> {
  const response = await fetch(`${API_BASE_URL}/locks/${encodeURIComponent(lockId)}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claimant,
      network,
      message: proof.message,
      signature: proof.signature,
      signerAddress: proof.signerAddress,
    }),
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
 * Fee tier preview (#468, #673).
 *
 * Reads the account's cumulative volume on-chain via getRebateVolume (a
 * Soroban RPC simulation of the bridge contract's rebate_for — see that
 * function's own doc comment in src/lib/stellar.ts for what's confirmed vs.
 * still a best guess) and maps it onto the tier ladder with
 * buildFeeTierStatus. `/fee-tiers/preview` never existed as a backend route
 * (#673) — this replaces that placeholder entirely rather than proxying to
 * a route that isn't there.
 *
 * Returns null both when the account has no tier data yet and when the
 * request itself fails — callers treat "no data" as "hide the tier display"
 * either way
 */
export async function getFeeTierPreview(
  address: string,
  network: StellarNetwork
): Promise<FeeTierStatus | null> {
  try {
    const response = await fetch(
      `/api/backend/referrals/stats?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as FeeTierStatus;
  } catch {
    return null;
  }
}

/**
 * Referral stats (#469).
 *
 * PLACEHOLDER INTERFACE: see `src/lib/referrals.ts` for why — no contract
 * source or referral API route exists anywhere in this repo to build against
 * yet. The route (`GET /referrals?address=&network=`) and response shape are
 * a best-guess and must be reconciled against the real API once it lands.
 *
 * Returns null both when the account has no referral data yet and when the
 * request itself fails — callers treat "no data" as "hide the referral
 * display" either way.
 */
export async function getReferralStats(
  address: string,
  network: StellarNetwork
): Promise<ReferralStats | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/referrals?address=${encodeURIComponent(address)}&network=${encodeURIComponent(network)}`
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ReferralStats;
  } catch {
    return null;
  }
}

/**
 * Submits a signed transaction to the backend for relay to Horizon.
 *
 * PLACEHOLDER INTERFACE: no transaction submission route exists anywhere in
 * this repo to build against yet; the route (`POST /transactions`) and
 * response shape are a best-guess and must be reconciled against the real
 * API once it lands.
 */
export async function submitTransaction(
  signedXdr: string,
  network: StellarNetwork
): Promise<BridgeTransactionData> {
  const response = await fetch(`${API_BASE_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xdr: signedXdr, network }),
  });

  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, `Transaction submission failed (${response.status})`));
  }
  return (await response.json()) as BridgeTransactionData;
}
