/**
 * Regression tests for #931: the transaction's time bound used to start a
 * 30s clock before the wallet prompt was even shown, so the human-approval
 * round trip (reading the prompt, unlocking, confirming on a hardware
 * device) regularly ate the whole budget and Horizon rejected the signed
 * transaction with `tx_too_late`.
 */
import { describe, it, expect } from "vitest";
import {
  Account,
  Asset,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { TRANSACTION_TIMEOUT_SECONDS, isTxTooLateError } from "@/lib/stellar";

describe("TRANSACTION_TIMEOUT_SECONDS (#931)", () => {
  it("is wide enough to cover human wallet approval (>= 180s)", () => {
    expect(TRANSACTION_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(180);
  });

  it("produces a built transaction whose maxTime gives at least 180s from build time", () => {
    const account = new Account(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VQ",
      "100"
    );
    const beforeBuild = Math.floor(Date.now() / 1000);

    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBTUMXBQ",
          asset: Asset.native(),
          amount: "1",
        })
      )
      .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
      .build();

    const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
    expect(maxTime).toBeGreaterThan(0);
    expect(maxTime - beforeBuild).toBeGreaterThanOrEqual(180);
  });
});

describe("isTxTooLateError (#931)", () => {
  it("returns true for a Horizon tx_too_late result envelope", () => {
    const error = {
      response: {
        data: { extras: { result_codes: { transaction: "tx_too_late" } } },
      },
    };
    expect(isTxTooLateError(error)).toBe(true);
  });

  it("returns true for a plain error message mentioning tx_too_late", () => {
    expect(isTxTooLateError(new Error("Horizon rejected: tx_too_late"))).toBe(true);
  });

  it("returns false for unrelated Horizon result codes", () => {
    const error = {
      response: {
        data: { extras: { result_codes: { transaction: "tx_bad_seq" } } },
      },
    };
    expect(isTxTooLateError(error)).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isTxTooLateError(null)).toBe(false);
    expect(isTxTooLateError(undefined)).toBe(false);
    expect(isTxTooLateError({})).toBe(false);
    expect(isTxTooLateError("tx_too_late as a bare string")).toBe(false);
  });
});
