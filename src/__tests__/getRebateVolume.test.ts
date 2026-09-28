import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

/**
 * Tests for getRebateVolume (#673) — the Soroban RPC simulation reading an
 * account's cumulative volume from the bridge contract's rebate_for(user).
 *
 * BRIDGE_CONTRACT_ID (src/lib/types.ts) is resolved once at module import
 * time from NEXT_PUBLIC_BRIDGE_CONTRACT_ID, so it's set before each dynamic
 * re-import (vi.resetModules) rather than mocked — the "no contract
 * configured" case specifically needs that var genuinely unset.
 *
 * @stellar/stellar-sdk's rpc.Server is mocked (same pattern as
 * stellar-signing-guards.test.ts) so no real network call is made; every
 * other SDK export (Contract, Address, scValToNative, TransactionBuilder,
 * Account) is real, so the transaction this builds is a real, valid Soroban
 * invocation envelope, not a stub.
 */

const simulateTransactionMock = vi.fn();

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.simulateTransaction = simulateTransactionMock;
      }),
    },
  };
});

const originalContractId = process.env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID;
// A real, validly-checksummed keypair — StrKey validation (and Address.fromString
// inside getRebateVolume) rejects a hand-rolled "G" + repeated-char string.
const G_ADDRESS = Keypair.random().publicKey();
const CONTRACT_ID = StrKey.encodeContract(Keypair.random().rawPublicKey());

function setContractId(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID;
  else process.env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID = value;
}

beforeEach(() => {
  simulateTransactionMock.mockReset();
});

afterEach(() => {
  setContractId(originalContractId);
  vi.resetModules();
});

describe("getRebateVolume", () => {
  it("returns null without calling Horizon/RPC when no contract is configured", async () => {
    vi.resetModules();
    setContractId(undefined);
    const { getRebateVolume } = await import("../lib/stellar");

    const volume = await getRebateVolume(G_ADDRESS, "TESTNET");
    expect(volume).toBeNull();
    expect(simulateTransactionMock).not.toHaveBeenCalled();
  });

  it("returns null for an invalid address without calling the RPC", async () => {
    vi.resetModules();
    setContractId(CONTRACT_ID);
    const { getRebateVolume } = await import("../lib/stellar");

    const volume = await getRebateVolume("not-an-address", "TESTNET");
    expect(volume).toBeNull();
    expect(simulateTransactionMock).not.toHaveBeenCalled();
  });

  it("decodes a successful simulation's retval into a number", async () => {
    vi.resetModules();
    setContractId(CONTRACT_ID);
    const sdk = await import("@stellar/stellar-sdk");
    simulateTransactionMock.mockResolvedValue({
      // isSimulationSuccess checks for "transactionData" — a real success
      // response always has one; only its presence matters here.
      transactionData: {},
      result: { retval: sdk.nativeToScVal(4500, { type: "u64" }) },
    });

    const { getRebateVolume } = await import("../lib/stellar");
    const volume = await getRebateVolume(G_ADDRESS, "TESTNET");
    expect(volume).toBe(4500);
  });

  it("returns null when the simulation itself errors", async () => {
    vi.resetModules();
    setContractId(CONTRACT_ID);
    simulateTransactionMock.mockResolvedValue({ error: "contract not found" });

    const { getRebateVolume } = await import("../lib/stellar");
    const volume = await getRebateVolume(G_ADDRESS, "TESTNET");
    expect(volume).toBeNull();
  });

  it("returns null instead of throwing when the RPC call rejects", async () => {
    vi.resetModules();
    setContractId(CONTRACT_ID);
    simulateTransactionMock.mockRejectedValue(new Error("network down"));

    const { getRebateVolume } = await import("../lib/stellar");
    const volume = await getRebateVolume(G_ADDRESS, "TESTNET");
    expect(volume).toBeNull();
  });

  it("returns null when the decoded retval isn't a finite number", async () => {
    vi.resetModules();
    setContractId(CONTRACT_ID);
    const sdk = await import("@stellar/stellar-sdk");
    simulateTransactionMock.mockResolvedValue({
      transactionData: {},
      result: { retval: sdk.nativeToScVal("not-a-number", { type: "string" }) },
    });

    const { getRebateVolume } = await import("../lib/stellar");
    const volume = await getRebateVolume(G_ADDRESS, "TESTNET");
    expect(volume).toBeNull();
  });
});
