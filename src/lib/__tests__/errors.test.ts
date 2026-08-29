import { describe, it, expect } from 'vitest';
import {
  AppError,
  ErrorCode,
  createAppError,
  parseError,
  handleError,
} from '../errors';

describe('Error Handling (#360)', () => {
  describe('AppError', () => {
    it('creates an error with all fields', () => {
      const err = createAppError(ErrorCode.WALLET_NOT_FOUND);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(ErrorCode.WALLET_NOT_FOUND);
      expect(err.userMessage).toBeTruthy();
      expect(err.retryable).toBe(false);
    });

    it('marks retryable errors correctly', () => {
      expect(createAppError(ErrorCode.API_ERROR).retryable).toBe(true);
      expect(createAppError(ErrorCode.TIMEOUT).retryable).toBe(true);
      expect(createAppError(ErrorCode.TRANSACTION_FAILED).retryable).toBe(true);
      expect(createAppError(ErrorCode.INVALID_ADDRESS).retryable).toBe(false);
      expect(createAppError(ErrorCode.TRANSACTION_REJECTED).retryable).toBe(false);
    });
  });

  describe('parseError', () => {
    it('returns AppError unchanged', () => {
      const original = createAppError(ErrorCode.TIMEOUT);
      expect(parseError(original)).toBe(original);
    });

    it('maps Freighter not detected', () => {
      const err = parseError(new Error('Freighter not detected'));
      expect(err.code).toBe(ErrorCode.WALLET_NOT_FOUND);
    });

    it('maps wallet connection errors', () => {
      const err = parseError(new Error('Failed to connect wallet'));
      expect(err.code).toBe(ErrorCode.WALLET_CONNECTION_FAILED);
    });

    it('maps network mismatch', () => {
      const err = parseError(new Error('Wrong network passphrase'));
      expect(err.code).toBe(ErrorCode.NETWORK_MISMATCH);
    });

    it('maps transaction rejected', () => {
      const err = parseError(new Error('User rejected the transaction'));
      expect(err.code).toBe(ErrorCode.TRANSACTION_REJECTED);
    });

    it('maps insufficient balance', () => {
      const err = parseError(new Error('Insufficient balance'));
      expect(err.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    });

    it('maps timeout', () => {
      const err = parseError(new Error('Request timed out'));
      expect(err.code).toBe(ErrorCode.TIMEOUT);
    });

    it('maps invalid address', () => {
      const err = parseError(new Error('Invalid address format'));
      expect(err.code).toBe(ErrorCode.INVALID_ADDRESS);
    });

    it('maps unknown errors', () => {
      const err = parseError(new Error('Something weird happened'));
      expect(err.code).toBe(ErrorCode.UNKNOWN);
    });

    it('handles string errors', () => {
      const err = parseError('connection refused');
      expect(err).toBeInstanceOf(AppError);
    });

    it('handles non-Error objects', () => {
      const err = parseError({ status: 500 });
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe('handleError', () => {
    it('returns parsed AppError without throwing', () => {
      const result = handleError(new Error('Freighter not detected'), 'connectWallet');
      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.WALLET_NOT_FOUND);
    });

    it('handles undefined errors', () => {
      const result = handleError(undefined);
      expect(result).toBeInstanceOf(AppError);
    });
  });

  describe('Every ErrorCode has a user message', () => {
    it.each(Object.values(ErrorCode))('%s has a user-friendly message', (code) => {
      const err = createAppError(code as ErrorCode);
      expect(err.userMessage).toBeTruthy();
      expect(err.userMessage.length).toBeGreaterThan(5);
    });
  });
});
