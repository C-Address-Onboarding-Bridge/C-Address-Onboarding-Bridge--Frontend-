import { describe, it, expect } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { simulatePayment, type AccountBalances } from "@/lib/stellar";

// Real, checksum-valid StrKeys so the destination validation is exercised
// against genuine values rather than look-alikes.
const keypair = Keypair.random();
const G_ADDRESS = keypair.publicKey();
const C_ADDRESS = StrKey.encodeContract(keypair.rawPublicKey());
const OTHER_G = Keypair.random().publicKey();

const FUNDED: AccountBalances = {
  total: "100",
  balances: [
    { asset: "XLM", amount: "100" },
    { asset: "USDC", amount: "50" },
  ],
};

const request = {
  sourceAddress: G_ADDRESS,
  destinationAddress: C_ADDRESS,
  amount: "10",
  assetCode: "XLM" as string,
};

describe("simulatePayment — predicted failure reasons (#478)", () => {
  it("predicts failure for an invalid destination address", () => {
    const result = simulatePayment(
      { ...request, destinationAddress: "not-an-address" },
      FUNDED,
      200
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_destination");
      expect(result.message).toMatch(/destination/i);
    }
  });

  it("predicts failure for an invalid amount", () => {
    const result = simulatePayment({ ...request, amount: "0.12345678" }, FUNDED, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_amount");
      expect(result.message).toMatch(/amount/i);
    }
  });

  it("predicts failure for an unfunded source account", () => {
    const result = simulatePayment(request, { total: "0", balances: [], unfunded: true }, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unfunded_source");
      expect(result.message).toMatch(/doesn't exist/i);
    }
  });

  it("predicts failure when the XLM balance cannot cover the amount plus reserve", () => {
    const result = simulatePayment(request, { total: "5", balances: [{ asset: "XLM", amount: "5" }] }, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficient_balance");
      expect(result.message).toMatch(/balance/i);
    }
  });

  it("predicts failure when a non-native asset has no trustline", () => {
    const result = simulatePayment(
      { ...request, assetCode: "USDC" },
      { total: "100", balances: [{ asset: "XLM", amount: "100" }] },
      200
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_trustline");
      expect(result.message).toMatch(/trustline/i);
    }
  });

  it("predicts failure when the non-native asset balance is too low", () => {
    const result = simulatePayment(
      { ...request, assetCode: "USDC", amount: "60" },
      FUNDED,
      200
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficient_balance");
    }
  });
});

describe("simulatePayment — successful predictions", () => {
  it("reports the fee, net amount, and recipient for an XLM payment", () => {
    const result = simulatePayment(request, FUNDED, 200);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.feeStroops).toBe("200");
      expect(result.feeXlm).toBe("0.00002 XLM");
      // The fee is charged to the sender on top of the payment, not
      // deducted from it — the recipient gets the full requested amount. (#923)
      expect(result.netAmount).toBe("10");
      expect(result.grossAmount).toBe("10");
      expect(result.feePaidBy).toBe("sender");
      expect(result.asset).toBe("XLM");
      expect(result.recipient).toBe(C_ADDRESS);
    }
  });

  it("does not deduct the fee from the net amount even for amounts with float-noise-prone decimals (#923)", () => {
    // 0.3 - 0.00002 in plain float arithmetic produces 0.29998000000000004;
    // netAmount must stay exactly "0.3" since the fee isn't deducted at all.
    const result = simulatePayment({ ...request, amount: "0.3" }, FUNDED, 200);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.netAmount).toBe("0.3");
      expect(result.grossAmount).toBe("0.3");
    }
  });

  it("does not deduct the fee from non-native assets", () => {
    const result = simulatePayment({ ...request, assetCode: "USDC", amount: "40" }, FUNDED, 200);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.netAmount).toBe("40");
      expect(result.asset).toBe("USDC");
    }
  });
});

describe("simulatePayment — reserve, subentry and liability accuracy (#925)", () => {
  it("rejects 'send max' XLM on a one-trustline account that only reserves the flat 1 XLM", () => {
    // One trustline raises the real reserve to 1.5 XLM (2 base units for the
    // account + 1 for the trustline, at 0.5 XLM each). An account with 10
    // XLM total and one trustline has 8.5 XLM spendable, not 9 — sending the
    // naive (flat-1.0-reserve) max of 9 must be rejected.
    const oneTrustlineAccount: AccountBalances = {
      total: "10",
      balances: [
        { asset: "XLM", amount: "10" },
        { asset: "USDC", amount: "5" },
      ],
      subentryCount: 1,
    };
    const result = simulatePayment({ ...request, amount: "9" }, oneTrustlineAccount, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficient_balance");
    }
  });

  it("accepts the real spendable amount (total - 1.5 XLM reserve - fee) on a one-trustline account", () => {
    const oneTrustlineAccount: AccountBalances = {
      total: "10",
      balances: [
        { asset: "XLM", amount: "10" },
        { asset: "USDC", amount: "5" },
      ],
      subentryCount: 1,
    };
    // 10 - 1.5 reserve - 0.00002 fee = 8.49998 spendable.
    const result = simulatePayment({ ...request, amount: "8.49998" }, oneTrustlineAccount, 200);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-XLM payment when the account's 1 XLM total can't also cover the fee above the reserve", () => {
    // 1 XLM total with one trustline leaves 1 - 1.5 = negative spendable XLM,
    // so even though the USDC balance itself is sufficient, the fee (paid in
    // XLM) can't be covered and the payment must be rejected.
    const thinXlmAccount: AccountBalances = {
      total: "1",
      balances: [
        { asset: "XLM", amount: "1" },
        { asset: "USDC", amount: "50" },
      ],
      subentryCount: 1,
    };
    const result = simulatePayment({ ...request, assetCode: "USDC", amount: "10" }, thinXlmAccount, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficient_balance");
    }
  });

  it("excludes XLM tied up in open sell offers from the spendable amount", () => {
    const withOffer: AccountBalances = {
      total: "10",
      balances: [{ asset: "XLM", amount: "10", sellingLiabilities: "5" }],
    };
    // Spendable = 10 - 1.0 reserve - 5 liabilities = 4. Sending 5 must fail.
    const result = simulatePayment({ ...request, amount: "5" }, withOffer, 200);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficient_balance");
    }
  });
});

describe("simulatePayment — destination handling", () => {
  it("predicts success for a G-address destination (classic payment)", () => {
    // A classic payment to another G-address is the flow the review screen
    // serves while C-address bridging is still gated (#284).
    const result = simulatePayment(
      { ...request, destinationAddress: OTHER_G },
      FUNDED,
      200
    );
    expect(result.ok).toBe(true);
  });
});
