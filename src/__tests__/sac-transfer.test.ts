/**
 * #909 — getTransactionByHash and the confirmations route must handle SAC
 * (Stellar Asset Contract) transfers made via invoke_host_function, not just
 * classic "payment" operations.
 *
 * The G→C bridge submits a Soroban smart-contract call whose fund movement is
 * reported by Horizon in `asset_balance_changes`, not in the top-level
 * `from`/`to`/`amount` fields. Before this fix both single-transaction lookups
 * only scanned for op.type === "payment" and returned null/blank for any
 * invoke_host_function transaction — including the app's own core flow.
 *
 * These tests use recorded Horizon response shapes (no real network calls).
 */
import { describe, it, expect } from "vitest";
import { extractTransferFromOps } from "@/lib/operationTransfer";

// ---------------------------------------------------------------------------
// Recorded Horizon operation shapes
// ---------------------------------------------------------------------------

/** Classic payment operation (Stellar SDK shape). */
const classicPaymentOp = {
  id: "op-payment-1",
  type: "payment",
  from: "GABC1234FROMADDRESS",
  to: "GXYZ5678TOADDRESS",
  amount: "50.0000000",
  asset_type: "native",
  asset_code: undefined,
  transaction_successful: true,
  created_at: "2024-01-01T12:00:00Z",
  transaction_hash: "aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222",
};

/** USDC payment operation. */
const usdcPaymentOp = {
  ...classicPaymentOp,
  asset_type: "credit_alphanum4",
  asset_code: "USDC",
  asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

/** invoke_host_function with a SAC transfer (G→C bridge). */
const sacTransferOp = {
  id: "op-invoke-1",
  type: "invoke_host_function",
  from: undefined,
  to: undefined,
  amount: undefined,
  asset_type: undefined,
  transaction_successful: true,
  created_at: "2024-01-01T12:00:00Z",
  transaction_hash: "aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb3333",
  asset_balance_changes: [
    {
      type: "transfer",
      from: "GABC1234FROMGADDRESS000000000000000000000000000000000000000",
      to: "CA7QYNF7SOWQ3GLR2BGMZEHXR5F26RWKQPPPYEJL5PPEZU3LNAKYNZL",
      amount: "100.0000000",
      asset_type: "native",
      asset_code: undefined,
    },
  ],
};

/** invoke_host_function with USDC SAC transfer. */
const sacUsdcTransferOp = {
  ...sacTransferOp,
  asset_balance_changes: [
    {
      type: "transfer",
      from: "GABC1234FROMGADDRESS000000000000000000000000000000000000000",
      to: "CA7QYNF7SOWQ3GLR2BGMZEHXR5F26RWKQPPPYEJL5PPEZU3LNAKYNZL",
      amount: "250.0000000",
      asset_type: "credit_alphanum4",
      asset_code: "USDC",
    },
  ],
};

/** invoke_host_function with NO asset_balance_changes (e.g. a data-only call). */
const nonTransferInvokeOp = {
  id: "op-invoke-2",
  type: "invoke_host_function",
  transaction_successful: true,
  asset_balance_changes: [],
};

/** create_account operation. */
const createAccountOp = {
  id: "op-create-1",
  type: "create_account",
  funder: "GABC1234FROMGADDRESS000000000000000000000000000000000000000",
  account: "GNEW5678NEWACCOUNT00000000000000000000000000000000000000",
  starting_balance: "1.5000000",
  transaction_successful: true,
};

/** path_payment operation. */
const pathPaymentOp = {
  id: "op-path-1",
  type: "path_payment_strict_send",
  from: "GABC1234FROMGADDRESS000000000000000000000000000000000000000",
  to: "GXYZ5678TOADDRESS",
  amount: "75.0000000",
  asset_type: "credit_alphanum4",
  asset_code: "USDC",
  transaction_successful: true,
};

// ---------------------------------------------------------------------------
// extractTransferFromOps
// ---------------------------------------------------------------------------

describe("extractTransferFromOps — #909 shared helper", () => {
  it("extracts from/to/amount/asset from a classic payment op", () => {
    const result = extractTransferFromOps([classicPaymentOp]);
    expect(result).not.toBeNull();
    expect(result!.fromAddress).toBe("GABC1234FROMADDRESS");
    expect(result!.toAddress).toBe("GXYZ5678TOADDRESS");
    expect(result!.amount).toBe("50.0000000");
    expect(result!.asset).toBe("XLM");
  });

  it("extracts asset code from a USDC payment op", () => {
    const result = extractTransferFromOps([usdcPaymentOp]);
    expect(result).not.toBeNull();
    expect(result!.asset).toBe("USDC");
  });

  it("extracts from/to/amount/asset from an invoke_host_function SAC XLM transfer", () => {
    const result = extractTransferFromOps([sacTransferOp]);
    expect(result).not.toBeNull();
    expect(result!.fromAddress).toBe(
      "GABC1234FROMGADDRESS000000000000000000000000000000000000000"
    );
    expect(result!.toAddress).toBe(
      "CA7QYNF7SOWQ3GLR2BGMZEHXR5F26RWKQPPPYEJL5PPEZU3LNAKYNZL"
    );
    expect(result!.amount).toBe("100.0000000");
    expect(result!.asset).toBe("XLM");
  });

  it("extracts asset code from an invoke_host_function SAC USDC transfer", () => {
    const result = extractTransferFromOps([sacUsdcTransferOp]);
    expect(result).not.toBeNull();
    expect(result!.asset).toBe("USDC");
    expect(result!.amount).toBe("250.0000000");
  });

  it("returns null for invoke_host_function with no asset_balance_changes", () => {
    const result = extractTransferFromOps([nonTransferInvokeOp]);
    expect(result).toBeNull();
  });

  it("extracts from/to/amount from a create_account op", () => {
    const result = extractTransferFromOps([createAccountOp]);
    expect(result).not.toBeNull();
    expect(result!.fromAddress).toBe(
      "GABC1234FROMGADDRESS000000000000000000000000000000000000000"
    );
    expect(result!.toAddress).toBe("GNEW5678NEWACCOUNT00000000000000000000000000000000000000");
    expect(result!.amount).toBe("1.5000000");
    expect(result!.asset).toBe("XLM");
  });

  it("extracts from a path_payment op", () => {
    const result = extractTransferFromOps([pathPaymentOp]);
    expect(result).not.toBeNull();
    expect(result!.asset).toBe("USDC");
  });

  it("returns null for an empty operations array", () => {
    const result = extractTransferFromOps([]);
    expect(result).toBeNull();
  });

  it("returns null for an array of unrecognised operation types", () => {
    const result = extractTransferFromOps([
      { id: "op-x", type: "set_options", transaction_successful: true },
    ]);
    expect(result).toBeNull();
  });

  it("skips a non-transfer invoke_host_function and returns null when it is the only op", () => {
    const result = extractTransferFromOps([nonTransferInvokeOp, nonTransferInvokeOp]);
    expect(result).toBeNull();
  });

  it("picks the first fund-moving op when multiple operations are present", () => {
    // SAC transfer first, then a classic payment — should return the SAC one
    const result = extractTransferFromOps([sacTransferOp, classicPaymentOp]);
    expect(result).not.toBeNull();
    expect(result!.toAddress).toBe(
      "CA7QYNF7SOWQ3GLR2BGMZEHXR5F26RWKQPPPYEJL5PPEZU3LNAKYNZL"
    );
  });
});
