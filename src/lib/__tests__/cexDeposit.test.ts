import { describe, it, expect } from "vitest";
import { buildCexDepositMemo, buildCexDepositUri, MEMO_TEXT_MAX_BYTES } from "../cexDeposit";

const C_ADDRESS = "CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTAB12CD34";

describe("cexDeposit (#680)", () => {
  describe("buildCexDepositMemo", () => {
    it("matches the backend's documented bridge:{exchange}:{suffix} format", () => {
      expect(buildCexDepositMemo("Binance", C_ADDRESS)).toBe(`bridge:binance:${C_ADDRESS.slice(-8)}`);
    });

    it("lowercases the exchange name", () => {
      expect(buildCexDepositMemo("Coinbase", C_ADDRESS)).toMatch(/^bridge:coinbase:/);
      expect(buildCexDepositMemo("KRAKEN", C_ADDRESS)).toMatch(/^bridge:kraken:/);
    });

    it("uses exactly the last 8 characters of the C-address as the suffix", () => {
      const memo = buildCexDepositMemo("binance", C_ADDRESS);
      const suffix = memo.split(":")[2];
      expect(suffix).toHaveLength(8);
      expect(suffix).toBe(C_ADDRESS.slice(-8));
    });

    it("produces a different memo for a different C-address with the same exchange", () => {
      const otherAddress = "CZYXWVUTSRQPONMLKJIHGFEDCBA765432ZYXWVUTSRQPONMLKJIHGFEDC98ZZ99";
      expect(buildCexDepositMemo("binance", C_ADDRESS)).not.toBe(buildCexDepositMemo("binance", otherAddress));
    });

    it("stays within Stellar's MEMO_TEXT byte limit for every supported exchange", () => {
      for (const exchange of ["Binance", "Coinbase", "Kraken"]) {
        const memo = buildCexDepositMemo(exchange, C_ADDRESS);
        expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(MEMO_TEXT_MAX_BYTES);
      }
    });
  });

  describe("buildCexDepositUri", () => {
    it("builds a SEP-0007 web+stellar:pay URI with destination, memo, and memo_type", () => {
      const uri = buildCexDepositUri("GDEPOSITADDRESSEXAMPLE1234567890ABCDEFGHIJKLMNOPQRSTUV", "bridge:binance:AB12CD34");
      expect(uri.startsWith("web+stellar:pay?")).toBe(true);

      const params = new URLSearchParams(uri.split("?")[1]);
      expect(params.get("destination")).toBe("GDEPOSITADDRESSEXAMPLE1234567890ABCDEFGHIJKLMNOPQRSTUV");
      expect(params.get("memo")).toBe("bridge:binance:AB12CD34");
      expect(params.get("memo_type")).toBe("MEMO_TEXT");
    });

    it("percent-encodes special characters in the memo", () => {
      const uri = buildCexDepositUri("GDEST", "bridge:binance:AB&CD=EF");
      const params = new URLSearchParams(uri.split("?")[1]);
      expect(params.get("memo")).toBe("bridge:binance:AB&CD=EF");
      expect(uri).not.toContain("AB&CD=EF");
    });
  });
});
