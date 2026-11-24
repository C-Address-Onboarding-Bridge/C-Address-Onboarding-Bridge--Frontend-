import { describe, it, expect } from 'vitest';
import { parseError, ErrorCode } from '@/lib/errors';

describe('parseError precedence & classification (#945)', () => {
  const cases: Array<{
    input: string;
    expectedCode: ErrorCode;
    expectedRetryable: boolean;
  }> = [
    {
      input: 'Transaction rejected by wallet',
      expectedCode: ErrorCode.TRANSACTION_REJECTED,
      expectedRetryable: false,
    },
    {
      input: 'User denied the wallet request',
      expectedCode: ErrorCode.TRANSACTION_REJECTED,
      expectedRetryable: false,
    },
    {
      input: 'Network error while contacting faucet',
      expectedCode: ErrorCode.API_ERROR,
      expectedRetryable: true,
    },
    {
      input: 'NetworkError when attempting to fetch resource',
      expectedCode: ErrorCode.API_ERROR,
      expectedRetryable: true,
    },
    {
      input: 'Failed to fetch from Horizon',
      expectedCode: ErrorCode.API_ERROR,
      expectedRetryable: true,
    },
    {
      input: 'Request timeout while contacting wallet',
      expectedCode: ErrorCode.TIMEOUT,
      expectedRetryable: true,
    },
    {
      input: 'Wallet returned an unexpected response while signing — insufficient balance',
      expectedCode: ErrorCode.INSUFFICIENT_BALANCE,
      expectedRetryable: false,
    },
    {
      input: 'Network changed in Freighter — expected TESTNET',
      expectedCode: ErrorCode.NETWORK_MISMATCH,
      expectedRetryable: false,
    },
    {
      input: 'Could not connect to Freighter wallet',
      expectedCode: ErrorCode.WALLET_CONNECTION_FAILED,
      expectedRetryable: true,
    },
  ];

  it.each(cases)(
    'maps "$input" -> $expectedCode (retryable=$expectedRetryable)',
    ({ input, expectedCode, expectedRetryable }) => {
      const parsed = parseError(new Error(input));
      expect(parsed.code).toBe(expectedCode);
      expect(parsed.retryable).toBe(expectedRetryable);
    },
  );
});