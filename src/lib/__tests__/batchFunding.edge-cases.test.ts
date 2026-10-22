import { describe, expect, it, vi } from "vitest";

vi.mock("../stellar", () => ({
  isValidStellarAddress: (address: string) => /^[GC][A-Z0-9]{55}$/.test(address),
  isCAddress: (address: string) => /^C[A-Z0-9]{55}$/.test(address),
  isValidStellarAmount: (amount: string) =>
    /^\d+(\.\d{1,7})?$/.test(amount) && parseFloat(amount) > 0,
}));

import { parseBatchInput, validateBatchAmount } from "../batchFunding";

const VALID_C = `C${"A".repeat(55)}`;

describe("batch funding parser edge cases", () => {
  it("handles mixed line endings and preserves original line numbers", () => {
    const parsed = parseBatchInput(`address,amount\r\n\r\n${VALID_C},10\rnot-a-row`);

    expect(parsed.rows).toMatchObject([{ line: 3, address: VALID_C, amount: "10" }]);
    expect(parsed.parseErrors).toMatchObject([{ line: 4, raw: "not-a-row" }]);
  });

  it("rejects amounts with more than seven decimal places", () => {
    expect(validateBatchAmount("12.34567891")).toMatch(/invalid amount/i);
  });
});
