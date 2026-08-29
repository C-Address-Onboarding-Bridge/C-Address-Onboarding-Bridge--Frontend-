/**
 * Tests for the signing-time security guards added in issues #241 and #242.
 *
 * #241 — A fresh network check happens immediately before signTransaction so a
 *         network switch in Freighter between page-load and the "Confirm" click
 *         aborts with a clear error rather than signing on the wrong chain.
 *
 * #242 — A runtime shape guard rejects a missing or non-string `signedTxXdr`
 *         with a clear "unexpected wallet response" error before the value
 *         reaches TransactionBuilder.fromXDR.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { buildAndSubmitPayment } from "@/lib/stellar";
import { clearAllSequenceCache } from "@/lib/sequenceManager";
import * as freighter from "@stellar/freighter-api";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const G_SOURCE = Keypair.random().publicKey();
const G_DEST = Keypair.random().publicKey();

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@stellar/freighter-api", () => ({
  signTransaction: vi.fn(),
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
}));

// Minimal Horizon.Server mock that makes the SDK happy enough to build and
// submit a real transaction.  The sequence/balances/fee values just need to be
// plausible; we are not testing the transaction building logic here.
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: vi.fn().mockImplementation(function MockHorizonServer(
        this: Record<string, unknown>
      ) {
        this.loadAccount = async () => ({
          sequenceNumber: () => "100",
          balances: [{ asset_type: "native", balance: "1000" }],
        });
        this.fetchBaseFee = async () => 100;
        this.submitTransaction = async () => ({
          hash: "mock-tx-hash",
          successful: true,
        });
      }),
    },
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const signTransaction = vi.mocked(freighter.signTransaction);
const getNetwork = vi.mocked(freighter.getNetwork);
const getAddress = vi.mocked(freighter.getAddress);

/** Make Freighter report a given network string. */
function mockFreighterNetwork(network: string) {
  getNetwork.mockResolvedValue({ network, networkPassphrase: "" } as never);
}

/** Valid sign result that echoes the XDR back (no actual signing needed). */
function mockValidSign() {
  signTransaction.mockImplementation(async (xdr: string) => ({
    signedTxXdr: xdr,
    signerAddress: G_SOURCE,
  }));
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  clearAllSequenceCache();
  vi.clearAllMocks();
  // By default the active account matches the source address so
  // assertActiveAccountMatches (#287) doesn't interfere with these tests.
  getAddress.mockResolvedValue({ address: G_SOURCE } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── #241: fresh network check immediately before signing ────────────────────

describe("#241 — fresh network check before signing", () => {
  it("proceeds normally when Freighter network matches the transaction network", async () => {
    mockFreighterNetwork("TESTNET");
    mockValidSign();

    const result = await buildAndSubmitPayment(
      G_SOURCE,
      G_DEST,
      "10",
      "XLM",
      "TESTNET"
    );

    expect(result.successful).toBe(true);
    // signTransaction must have been called (we got past the guard).
    expect(signTransaction).toHaveBeenCalledOnce();
  });

  it("aborts with a clear error when Freighter has switched to a different supported network", async () => {
    // Transaction is built for TESTNET, but Freighter is now on PUBLIC.
    mockFreighterNetwork("PUBLIC");
    mockValidSign();

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/Network changed in Freighter/);

    // signTransaction must NOT have been called — we aborted before signing.
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("aborts when Freighter reports an unsupported network (e.g. FUTURENET)", async () => {
    mockFreighterNetwork("FUTURENET");
    mockValidSign();

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/Network changed in Freighter/);

    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("aborts when the network cannot be read from Freighter (UNKNOWN)", async () => {
    getNetwork.mockRejectedValue(new Error("Freighter is locked"));
    mockValidSign();

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/Network changed in Freighter/);

    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("error message names both the expected and actual networks", async () => {
    // Built for TESTNET; Freighter now says PUBLIC.
    mockFreighterNetwork("PUBLIC");

    const error = await buildAndSubmitPayment(
      G_SOURCE,
      G_DEST,
      "10",
      "XLM",
      "TESTNET"
    ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/TESTNET/);
    expect((error as Error).message).toMatch(/PUBLIC/);
  });

  it("error message tells the user to retry", async () => {
    mockFreighterNetwork("PUBLIC");

    const error = await buildAndSubmitPayment(
      G_SOURCE,
      G_DEST,
      "10",
      "XLM",
      "TESTNET"
    ).catch((e: Error) => e);

    expect((error as Error).message).toMatch(/retry/i);
  });
});

// ─── #242: runtime shape guard on signedTxXdr ────────────────────────────────

describe("#242 — runtime shape guard on signedTxXdr", () => {
  beforeEach(() => {
    // Make the network check pass so we reach the signing step.
    mockFreighterNetwork("TESTNET");
  });

  it("proceeds normally when signedTxXdr is a non-empty string", async () => {
    mockValidSign();

    const result = await buildAndSubmitPayment(
      G_SOURCE,
      G_DEST,
      "10",
      "XLM",
      "TESTNET"
    );

    expect(result.successful).toBe(true);
  });

  it("throws a clear error when signedTxXdr is undefined (missing field)", async () => {
    // Simulate a wallet extension that omits the field entirely.
    signTransaction.mockResolvedValue({} as never);

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/unexpected response/i);
  });

  it("throws a clear error when signedTxXdr is an empty string", async () => {
    signTransaction.mockResolvedValue({ signedTxXdr: "" } as never);

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/unexpected response/i);
  });

  it("throws a clear error when signedTxXdr is a number", async () => {
    signTransaction.mockResolvedValue({ signedTxXdr: 12345 } as never);

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/unexpected response/i);
  });

  it("throws a clear error when signedTxXdr is null", async () => {
    signTransaction.mockResolvedValue({ signedTxXdr: null } as never);

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/unexpected response/i);
  });

  it("throws a clear error when the response is an array", async () => {
    signTransaction.mockResolvedValue([] as never);

    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow();
  });

  it("does not reach TransactionBuilder.fromXDR when signedTxXdr is missing", async () => {
    // If the guard is absent, fromXDR would throw a low-level parse error.
    // With the guard in place the error message must be our own, not the SDK's.
    signTransaction.mockResolvedValue({ signedTxXdr: undefined } as never);

    const error = await buildAndSubmitPayment(
      G_SOURCE,
      G_DEST,
      "10",
      "XLM",
      "TESTNET"
    ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    // Our message, not the SDK's decode error.
    expect((error as Error).message).toMatch(/unexpected response/i);
    expect((error as Error).message).not.toMatch(/decode/i);
    expect((error as Error).message).not.toMatch(/XDR/i);
  });
});
