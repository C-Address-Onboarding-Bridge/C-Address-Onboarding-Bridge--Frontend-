import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  getNextSequenceNumber,
  invalidateSequenceCache,
  clearAllSequenceCache,
  isBadSequenceError,
  withSequenceRetry,
} from "@/lib/sequenceManager";
import { Horizon, rpc } from "@stellar/stellar-sdk";

// Mock server implementations
const mockHorizonServer = {
  loadAccount: vi.fn(),
} as unknown as Horizon.Server;

// Built via Object.create so `instanceof rpc.Server` succeeds - fetchSequenceFromNetwork
// dispatches on instanceof, and a plain object cast never satisfies that check.
const mockSorobanRpcServer = Object.assign(Object.create(rpc.Server.prototype), {
  getAccount: vi.fn(),
}) as rpc.Server;

const testAccountId = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";

beforeEach(() => {
  clearAllSequenceCache();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe("sequenceManager", () => {
  describe("getNextSequenceNumber", () => {
    it("fetches from network on cache miss and returns incremented sequence for transaction", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const result = await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      expect(result).toBe(101n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledWith(testAccountId);
    });

    it("increments cache on second call", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const first = await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");
      const second = await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      expect(first).toBe(101n);
      expect(second).toBe(102n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(1);
    });

    it("increments multiple times within cache TTL", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET"));
      }

      expect(results).toEqual([101n, 102n, 103n, 104n, 105n]);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(1);
    });

    it("refetches after cache expiry", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      // First call
      await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      // Advance time past TTL (30 seconds)
      vi.advanceTimersByTime(31_000);

      // Update mock to return different sequence
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "200",
      });

      // Second call after TTL should refetch
      const result = await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      expect(result).toBe(201n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(2);
    });

    it("handles SorobanRpc server", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockSorobanRpcServer.getAccount as Mock).mockResolvedValue(mockAccount);

      const result = await getNextSequenceNumber(testAccountId, mockSorobanRpcServer, "TESTNET");

      expect(result).toBe(101n);
      expect(mockSorobanRpcServer.getAccount).toHaveBeenCalledWith(testAccountId);
    });
  });

  // Regression for #290: the cache used to be keyed on the account address
  // alone, so the same G-address served (and incremented) the other chain's
  // sequence after a Freighter network switch inside the 30s TTL.
  describe("network scoping", () => {
    it("keeps the same address independent across networks", async () => {
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "100",
      });

      const testnetSeq = await getNextSequenceNumber(
        testAccountId,
        mockHorizonServer,
        "TESTNET"
      );
      expect(testnetSeq).toBe(101n);

      // Mainnet holds an unrelated sequence for the same address.
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "5000",
      });

      const publicSeq = await getNextSequenceNumber(
        testAccountId,
        mockHorizonServer,
        "PUBLIC"
      );

      // Separate fetch, and no increment of the testnet entry.
      expect(publicSeq).toBe(5001n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(2);
    });

    it("increments each network's entry independently within the TTL", async () => {
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "100",
      });
      await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "5000",
      });
      await getNextSequenceNumber(testAccountId, mockHorizonServer, "PUBLIC");

      // Back to testnet inside the TTL: continues the testnet series, not the
      // mainnet one (the old behaviour returned 5002n here).
      const nextTestnet = await getNextSequenceNumber(
        testAccountId,
        mockHorizonServer,
        "TESTNET"
      );
      const nextPublic = await getNextSequenceNumber(
        testAccountId,
        mockHorizonServer,
        "PUBLIC"
      );

      expect(nextTestnet).toBe(102n);
      expect(nextPublic).toBe(5002n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(2);
    });

    it("invalidates only the (network, account) pair", async () => {
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "100",
      });
      await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "5000",
      });
      await getNextSequenceNumber(testAccountId, mockHorizonServer, "PUBLIC");

      invalidateSequenceCache(testAccountId, "TESTNET");

      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "200",
      });

      // Testnet re-fetches...
      expect(
        await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET")
      ).toBe(201n);
      // ...while mainnet still serves its untouched cached entry.
      expect(
        await getNextSequenceNumber(testAccountId, mockHorizonServer, "PUBLIC")
      ).toBe(5002n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(3);
    });

    it("withSequenceRetry invalidates only the network it ran on", async () => {
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "5000",
      });
      await getNextSequenceNumber(testAccountId, mockHorizonServer, "PUBLIC");

      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "100",
      });

      const badSeqError = {
        response: { data: { extras: { result_codes: { transaction: "tx_bad_seq" } } } },
      };

      let calls = 0;
      const fn = vi.fn(async (getSequence: () => Promise<bigint>) => {
        await getSequence();
        calls++;
        if (calls === 1) throw badSeqError;
        return "success";
      });

      const promise = withSequenceRetry(
        testAccountId,
        fn,
        mockHorizonServer,
        "TESTNET"
      );
      await vi.runAllTimersAsync();
      await promise;

      // The mainnet entry survived the testnet retry's invalidation.
      expect(
        await getNextSequenceNumber(testAccountId, mockHorizonServer, "PUBLIC")
      ).toBe(5002n);
    });
  });

  describe("invalidateSequenceCache", () => {
    it("causes refetch on next call", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      // Fetch and cache
      await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      // Invalidate cache
      invalidateSequenceCache(testAccountId, "TESTNET");

      // Update mock to return different sequence
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "200",
      });

      // Next call should refetch
      const result = await getNextSequenceNumber(testAccountId, mockHorizonServer, "TESTNET");

      expect(result).toBe(201n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(2);
    });

    it("only invalidates specified account", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const accountId1 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";
      const accountId2 = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBTUMXBQ";

      // Fetch both accounts
      await getNextSequenceNumber(accountId1, mockHorizonServer, "TESTNET");
      await getNextSequenceNumber(accountId2, mockHorizonServer, "TESTNET");

      // Invalidate only accountId1
      invalidateSequenceCache(accountId1, "TESTNET");

      // Update mock
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "200",
      });

      // Next call for accountId1 should refetch
      const result1 = await getNextSequenceNumber(accountId1, mockHorizonServer, "TESTNET");
      expect(result1).toBe(201n);

      // Next call for accountId2 should use cache (102n from cached 101n)
      const result2 = await getNextSequenceNumber(accountId2, mockHorizonServer, "TESTNET");
      expect(result2).toBe(102n);
    });
  });

  describe("isBadSequenceError", () => {
    it("returns true for Horizon tx_bad_seq error", () => {
      const error = {
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: "tx_bad_seq",
              },
            },
          },
        },
      };

      expect(isBadSequenceError(error)).toBe(true);
    });

    it("returns true for error message containing bad_seq", () => {
      const error = new Error("Transaction failed: bad_seq error");

      expect(isBadSequenceError(error)).toBe(true);
    });

    it("returns true for error message containing tx_bad_seq", () => {
      const error = new Error("tx_bad_seq: sequence number too far in the future");

      expect(isBadSequenceError(error)).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      const error = new Error("Transaction failed: insufficient balance");

      expect(isBadSequenceError(error)).toBe(false);
    });

    it("returns false for non-error objects", () => {
      expect(isBadSequenceError(null)).toBe(false);
      expect(isBadSequenceError(undefined)).toBe(false);
      expect(isBadSequenceError({})).toBe(false);
      expect(isBadSequenceError("some string")).toBe(false);
    });

    it("returns false for a Horizon-shaped error missing the result_codes", () => {
      expect(isBadSequenceError({ response: {} })).toBe(false);
      expect(isBadSequenceError({ response: { data: {} } })).toBe(false);
      expect(isBadSequenceError({ response: { data: { extras: {} } } })).toBe(false);
    });

    it("returns false for a Horizon-shaped error with an unrelated result code", () => {
      const error = {
        response: {
          data: {
            extras: {
              result_codes: { transaction: "tx_insufficient_balance" },
            },
          },
        },
      };
      expect(isBadSequenceError(error)).toBe(false);
    });
  });

  describe("withSequenceRetry", () => {
    it("calls function once on success", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const fn = vi.fn().mockResolvedValue("success");

      const result = await withSequenceRetry(testAccountId, fn, mockHorizonServer, "TESTNET");

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on bad_seq error", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const badSeqError = {
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: "tx_bad_seq",
              },
            },
          },
        },
      };

      const fn = vi.fn();
      fn.mockRejectedValueOnce(badSeqError);
      fn.mockResolvedValueOnce("success");

      const promise = withSequenceRetry(testAccountId, fn, mockHorizonServer, "TESTNET");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("invalidates cache between retries", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const badSeqError = {
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: "tx_bad_seq",
              },
            },
          },
        },
      };

      // fn must actually call getSequence for this test to exercise
      // loadAccount - a bare mockRejectedValueOnce/mockResolvedValueOnce
      // never invokes the callback it's handed.
      let callCount = 0;
      const fn = vi.fn(async (getSequence: () => Promise<bigint>) => {
        await getSequence();
        callCount++;
        if (callCount === 1) throw badSeqError;
        return "success";
      });

      const promise = withSequenceRetry(testAccountId, fn, mockHorizonServer, "TESTNET");
      await vi.runAllTimersAsync();
      await promise;

      // Should have called loadAccount at least twice (initial + after invalidation)
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(2);
    });

    it("does not retry on non-seq error", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const nonSeqError = new Error("Transaction failed: insufficient balance");

      const fn = vi.fn().mockRejectedValue(nonSeqError);

      await expect(
        withSequenceRetry(testAccountId, fn, mockHorizonServer, "TESTNET")
      ).rejects.toThrow("Transaction failed: insufficient balance");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws after maxRetries exceeded", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const badSeqError = {
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: "tx_bad_seq",
              },
            },
          },
        },
      };

      const fn = vi.fn().mockRejectedValue(badSeqError);

      const promise = withSequenceRetry(testAccountId, fn, mockHorizonServer, "TESTNET", 2);
      const expectation = expect(promise).rejects.toEqual(badSeqError);
      await vi.runAllTimersAsync();
      await expectation;

      // Should attempt maxRetries + 1 times
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("passes getSequence function to fn", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      let capturedSequence: bigint | null = null;

      const fn = vi.fn(async (getSequence: () => Promise<bigint>) => {
        capturedSequence = await getSequence();
        return "success";
      });

      await withSequenceRetry(testAccountId, fn, mockHorizonServer, "TESTNET");

      expect(capturedSequence).toBe(101n);
    });

    it("applies retry delay between attempts", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const badSeqError = {
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: "tx_bad_seq",
              },
            },
          },
        },
      };

      const fn = vi.fn();
      fn.mockRejectedValueOnce(badSeqError);
      fn.mockResolvedValueOnce("success");

      const promise = withSequenceRetry(testAccountId, fn, mockHorizonServer, "TESTNET");

      // Advance time to trigger retry
      await vi.advanceTimersToNextTimerAsync();

      const result = await promise;

      expect(result).toBe("success");
    });
  });

  describe("clearAllSequenceCache", () => {
    it("clears all cached sequences", async () => {
      const mockAccount = { sequenceNumber: () => "100" };
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue(mockAccount);

      const accountId1 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ";
      const accountId2 = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBTUMXBQ";

      // Fetch both accounts
      await getNextSequenceNumber(accountId1, mockHorizonServer, "TESTNET");
      await getNextSequenceNumber(accountId2, mockHorizonServer, "TESTNET");

      // Clear all cache
      clearAllSequenceCache();

      // Update mock
      (mockHorizonServer.loadAccount as Mock).mockResolvedValue({
        sequenceNumber: () => "200",
      });

      // Both should refetch
      const result1 = await getNextSequenceNumber(accountId1, mockHorizonServer, "TESTNET");
      const result2 = await getNextSequenceNumber(accountId2, mockHorizonServer, "TESTNET");

      expect(result1).toBe(201n);
      expect(result2).toBe(201n);
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(4);
    });

    it("is a no-op and does not throw when the cache is already empty", () => {
      expect(() => clearAllSequenceCache()).not.toThrow();
      expect(() => clearAllSequenceCache()).not.toThrow();
    });
  });
});
