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

/**
 * Create an AppError from an error code with optional details.
 */
export function createAppError(
  code: ErrorCode,
  message?: string,
  details?: unknown,
): AppError {
  throw new Error('Not implemented: createAppError');
}

/**
 * Parse an unknown error into a structured AppError.
 * Maps common Stellar/Freighter errors to typed codes.
 */
export function parseError(error: unknown): AppError {
  throw new Error('Not implemented: parseError');
}

/**
 * Handle an error: log it and return the parsed AppError.
 * Never throws — safe to use in catch blocks.
 */
export function handleError(error: unknown, context?: string): AppError {
  const parsed = parseError(error);
  console.error(context ? `[${context}] ${parsed.message}` : parsed.message, parsed.details ?? error);
  return parsed;
}
