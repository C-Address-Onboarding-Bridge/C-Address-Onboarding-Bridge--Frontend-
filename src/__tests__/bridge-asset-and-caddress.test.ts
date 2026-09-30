import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, StrKey, Operation } from "@stellar/stellar-sdk";
import { buildAndSubmitPayment, bridgeViaContract } from "@/lib/stellar";
import * as freighter from "@stellar/freighter-api";

const G_SOURCE = Keypair.random().publicKey();
const G_DEST = Keypair.random().publicKey();
const C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());
const USDC_ISSUER = Keypair.random().publicKey();
const SPAM_USDC_ISSUER = Keypair.random().publicKey();

const loadAccountMock = vi.fn();
const submitTransactionMock = vi.fn();

vi.mock("@stellar/freighter-api", () => ({
  signTransaction: vi.fn(),
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
}));

// Replace only Horizon.Server's network calls; every other export (Asset,
// Operation, TransactionBuilder, StrKey, Keypair, ...) stays the real SDK
// implementation so the assertions below exercise real operation-building
// logic, not a hand-rolled stand-in.
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {

/**
 * TODO(next-bounty): the tests marked `.skip` in this file assert behaviour that
 * was never finished (or was lost in a bad merge) during the first bounty
 * programme. They are skipped -- not deleted -- so the next programme has an
 * exact worklist: un-skip one, make it pass, repeat. Nothing here was rewritten
 * to fit the current implementation.
 */
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: vi.fn().mockImplementation(function MockHorizonServer(this: {
        loadAccount: typeof loadAccountMock;
        submitTransaction: typeof submitTransactionMock;
      }) {
        this.loadAccount = loadAccountMock;
        this.submitTransaction = submitTransactionMock;
      }),
    },
  };
});

// Regression coverage for #285: bridgeViaContract (and buildAndSubmitPayment,
// which it delegates to) must build a transaction whose operation asset
// matches the caller's requested assetCode instead of silently substituting
// XLM.
describe("asset resolution honors the requested assetCode (#285)", () => {
  let capturedOperation: { asset: { isNative(): boolean; code?: string; issuer?: string } } | null;

  beforeEach(() => {
    capturedOperation = null;

    vi.mocked(freighter.signTransaction).mockImplementation(async (xdr: string) => ({
      signedTxXdr: xdr,
      signerAddress: G_SOURCE,
    }));
    // The source must be Freighter's active account or the payment is refused
    // before it is ever built. (#287)
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: G_SOURCE } as never);

    loadAccountMock.mockResolvedValue({
      sequenceNumber: () => "100",
      balances: [
        { asset_type: "native", balance: "1000" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: USDC_ISSUER,
          balance: "500",
        },
      ],
    });

    submitTransactionMock.mockImplementation(async (tx: { operations: unknown[] }) => {
      capturedOperation = tx.operations[0] as typeof capturedOperation extends infer T ? NonNullable<T> : never;
      return { hash: "mock-hash", successful: true };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    loadAccountMock.mockReset();
    submitTransactionMock.mockReset();
  });

  it("builds a native XLM operation when XLM is selected", async () => {
    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");

    expect(capturedOperation).not.toBeNull();
    expect(capturedOperation?.asset.isNative()).toBe(true);
  });

  it("builds a USDC operation (not XLM) when USDC is selected", async () => {
    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "USDC", "TESTNET");

    expect(capturedOperation).not.toBeNull();
    expect(capturedOperation?.asset.isNative()).toBe(false);
    expect(capturedOperation?.asset.code).toBe("USDC");
    expect(capturedOperation?.asset.issuer).toBe(USDC_ISSUER);
  });

  it("throws instead of substituting an asset when no trustline exists", async () => {
    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "SHITCOIN", "TESTNET")
    ).rejects.toThrow(/trustline/i);
  });
});

// Regression coverage for #682: resolveAsset must select a token by
// code:issuer, not by code alone. When an account holds two assets sharing the
// code USDC (e.g. a spam token), the allowlisted issuer must win -- otherwise
// the user could send a worthless token while the UI says USDC.
describe("asset resolution honors the issuer, not just the code (#682)", () => {
  let capturedOperation: { asset: { isNative(): boolean; code?: string; issuer?: string } } | null;

  beforeEach(() => {
    capturedOperation = null;

    vi.mocked(freighter.signTransaction).mockImplementation(async (xdr: string) => ({
      signedTxXdr: xdr,
      signerAddress: G_SOURCE,
    }));
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: G_SOURCE } as never);

    // The spam token is listed first so a code-only lookup would pick it.
    loadAccountMock.mockResolvedValue({
      sequenceNumber: () => "100",
      balances: [
        { asset_type: "native", balance: "1000" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: SPAM_USDC_ISSUER,
          balance: "999999",
        },
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: USDC_ISSUER,
          balance: "500",
        },
      ],
    });

    submitTransactionMock.mockImplementation(async (tx: { operations: unknown[] }) => {
      capturedOperation = tx.operations[0] as typeof capturedOperation extends infer T ? NonNullable<T> : never;
      return { hash: "mock-hash", successful: true };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    loadAccountMock.mockReset();
    submitTransactionMock.mockReset();
  });

  it("selects the allowlisted USDC issuer, not the first same-code balance", async () => {
    await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "USDC", "TESTNET");

    expect(capturedOperation).not.toBeNull();
    expect(capturedOperation?.asset.isNative()).toBe(false);
    expect(capturedOperation?.asset.code).toBe("USDC");
    expect(capturedOperation?.asset.issuer).toBe(USDC_ISSUER);
    expect(capturedOperation?.asset.issuer).not.toBe(SPAM_USDC_ISSUER);
  });
});

// Regression coverage for #287: Freighter signs with its active account, so a
// transaction sourced from any other address can only fail at submission with
// tx_bad_auth. The signing prompt must be unreachable in that case.
describe("source address must be Freighter's active account (#287)", () => {
  const OTHER_ACCOUNT = Keypair.random().publicKey();

  beforeEach(() => {
    // The freighter mocks are module-level, so call history survives across
    // describe blocks unless it is cleared explicitly.
    vi.clearAllMocks();
    vi.mocked(freighter.signTransaction).mockImplementation(async (xdr: string) => ({
      signedTxXdr: xdr,
      signerAddress: G_SOURCE,
    }));
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: OTHER_ACCOUNT } as never);
    loadAccountMock.mockResolvedValue({
      sequenceNumber: () => "100",
      balances: [{ asset_type: "native", balance: "1000" }],
    });
    submitTransactionMock.mockResolvedValue({ hash: "mock-hash", successful: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    loadAccountMock.mockReset();
    submitTransactionMock.mockReset();
  });

  it("rejects with an actionable message naming both accounts", async () => {
    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/doesn't match the From address/);
  });

  it("never reaches Freighter's signing prompt", async () => {
    await expect(
      buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET")
    ).rejects.toThrow();

    expect(freighter.signTransaction).not.toHaveBeenCalled();
    expect(submitTransactionMock).not.toHaveBeenCalled();
  });

  it("allows the payment once the active account matches", async () => {
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: G_SOURCE } as never);

    const result = await buildAndSubmitPayment(G_SOURCE, G_DEST, "10", "XLM", "TESTNET");

    expect(result.hash).toBe("mock-hash");
    expect(freighter.signTransaction).toHaveBeenCalled();
  });
});

// Regression coverage for #284: classic Stellar payments cannot target a
// Soroban C-address (PaymentOp.destination has no C... encoding). bridgeViaContract
// must fail loudly and specifically instead of handing a C-address to
// Operation.payment and letting the SDK reject it with an opaque error.
describe("bridgeViaContract blocks C-address destinations honestly (#284)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a descriptive error naming the actual problem", async () => {
    await expect(
      bridgeViaContract(G_SOURCE, C_ADDRESS, "10", "XLM", "TESTNET")
    ).rejects.toThrow(/contract address|Soroban/i);
  });

  it("never calls Operation.payment with the C-address destination", async () => {
    const paymentSpy = vi.spyOn(Operation, "payment");

    await expect(
      bridgeViaContract(G_SOURCE, C_ADDRESS, "10", "XLM", "TESTNET")
    ).rejects.toThrow();

    expect(paymentSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid amounts before evaluating the destination", async () => {
    await expect(
      bridgeViaContract(G_SOURCE, C_ADDRESS, "0", "XLM", "TESTNET")
    ).rejects.toThrow(/Invalid amount/);
  });
});
