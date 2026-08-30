/**
 * Centralized error handling for the C-Address Onboarding Bridge.
 *
 * Provides typed error classes, a global error handler, and user-friendly
 * message mapping so errors are handled consistently across the app.
 */

export enum ErrorCode {
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  WALLET_CONNECTION_FAILED = 'WALLET_CONNECTION_FAILED',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  API_ERROR = 'API_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorContext {
  code: ErrorCode;
  message: string;
  userMessage: string;
  details?: unknown;
  retryable: boolean;
}

/**
 * Application error with typed code and user-friendly message.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly details?: unknown;
  public readonly retryable: boolean;

  constructor(context: ErrorContext) {
    super(context.message);
    this.name = 'AppError';
    this.code = context.code;
    this.userMessage = context.userMessage;
    this.details = context.details;
    this.retryable = context.retryable;
  }
}

/**
 * User-friendly messages for each error code.
 */
const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.WALLET_NOT_FOUND]: 'Please install a Stellar wallet (e.g. Freighter) to continue.',
  [ErrorCode.WALLET_CONNECTION_FAILED]: 'Could not connect to your wallet. Please try again.',
  [ErrorCode.NETWORK_MISMATCH]: 'Your wallet is on the wrong network. Please switch networks.',
  [ErrorCode.TRANSACTION_FAILED]: 'Transaction failed. Please try again.',
  [ErrorCode.TRANSACTION_REJECTED]: 'Transaction was rejected.',
  [ErrorCode.INSUFFICIENT_BALANCE]: 'Insufficient balance for this transaction.',
  [ErrorCode.INVALID_ADDRESS]: 'The provided address is not valid.',
  [ErrorCode.API_ERROR]: 'A server error occurred. Please try again later.',
  [ErrorCode.TIMEOUT]: 'The request timed out. Please check your connection.',
  [ErrorCode.UNKNOWN]: 'An unexpected error occurred.',
};

const RETRYABLE_CODES = new Set<ErrorCode>([
  ErrorCode.API_ERROR,
  ErrorCode.TIMEOUT,
  ErrorCode.TRANSACTION_FAILED,
]);

/**
 * Create an AppError from an error code with optional details.
 */
export function createAppError(
  code: ErrorCode,
  message?: string,
  details?: unknown,
): AppError {
  const userMessage = USER_MESSAGES[code];
  return new AppError({
    code,
    message: message ?? userMessage,
    userMessage,
    details,
    retryable: RETRYABLE_CODES.has(code),
  });
}

/**
 * Parse an unknown error into a structured AppError.
 * Maps common Stellar/Freighter errors to typed codes.
 */
export function parseError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Map specific patterns — order matters: more specific first
  if (lower.includes('not detected') || lower.includes('freighter not')) {
    return createAppError(ErrorCode.WALLET_NOT_FOUND, message);
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return createAppError(ErrorCode.TIMEOUT, message);
  }
  if (lower.includes('network') && lower.includes('passphrase')) {
    return createAppError(ErrorCode.NETWORK_MISMATCH, message);
  }
  if (lower.includes('wrong network') || (lower.includes('network') && lower.includes('mismatch'))) {
    return createAppError(ErrorCode.NETWORK_MISMATCH, message);
  }
  if (lower.includes('rejected') || lower.includes('declined')) {
    return createAppError(ErrorCode.TRANSACTION_REJECTED, message);
  }
  if (lower.includes('insufficient') || lower.includes('balance')) {
    return createAppError(ErrorCode.INSUFFICIENT_BALANCE, message);
  }
  if (lower.includes('connect')) {
    return createAppError(ErrorCode.WALLET_CONNECTION_FAILED, message);
  }
  if (lower.includes('invalid') && lower.includes('address')) {
    return createAppError(ErrorCode.INVALID_ADDRESS, message);
  }
  if (lower.includes('address') && lower.includes('format')) {
    return createAppError(ErrorCode.INVALID_ADDRESS, message);
  }
  if (lower.includes('transaction') && (lower.includes('failed') || lower.includes('error'))) {
    return createAppError(ErrorCode.TRANSACTION_FAILED, message);
  }

  return createAppError(ErrorCode.UNKNOWN, message, error);
}

/**
 * Handle an error: log it and return the parsed AppError.
 * Never throws — safe to use in catch blocks.
 */
export function handleError(error: unknown, context?: string): AppError {
  try {
    const appError = parseError(error);
    const prefix = context ? `[${context}] ` : '';
    console.error(`${prefix}${appError.code}: ${appError.message}`, appError.details);
    return appError;
  } catch {
    // Defensive: if parseError itself throws somehow, return a generic error
    return createAppError(ErrorCode.UNKNOWN, 'An unexpected error occurred');
  }
}
