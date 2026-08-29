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
      // 10 XLM minus a 0.00002 XLM fee.
      expect(Number(result.netAmount)).toBeCloseTo(9.99998, 5);
      expect(result.grossAmount).toBe("10");
      expect(result.asset).toBe("XLM");
      expect(result.recipient).toBe(C_ADDRESS);
    }
  });

  it("clamps the net amount at zero when the fee exceeds the amount", () => {
    const result = simulatePayment({ ...request, amount: "0.0000001" }, FUNDED, 10_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.netAmount)).toBe(0);
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
