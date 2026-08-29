import { describe, it, expect } from "vitest";
import {
  truncateAddress,
  toPublicConfirmation,
  isValidHash,
  getConfirmationUrl,
  generateMetadata,
  type TransactionConfirmation,
} from "@/lib/confirmations";

const SAMPLE_HASH = "a".repeat(64);
const SAMPLE_ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

describe("confirmations", () => {
  describe("truncateAddress", () => {
    it("truncates long addresses", () => {
      const result = truncateAddress(SAMPLE_ADDRESS);
      expect(result).toMatch(/^[A-Z]{6}\.\.\.[A-Z]{6}$/);
      expect(result).not.toContain(SAMPLE_ADDRESS);
    });

    it("returns full address if too short", () => {
      const short = "ABCD";
      expect(truncateAddress(short)).toBe(short);
    });

    it("respects custom visible chars", () => {
      const result = truncateAddress(SAMPLE_ADDRESS, 4);
      expect(result).toMatch(/^[A-Z]{4}\.\.\.[A-Z]{4}$/);
    });
  });

  describe("toPublicConfirmation", () => {
    it("converts confirmation and truncates addresses", () => {
      const confirmation: TransactionConfirmation = {
        hash: SAMPLE_HASH,
        amount: "100",
        asset: "USDC",
        timestamp: 1_700_000_000_000,
        fromAddress: SAMPLE_ADDRESS,
        toAddress: SAMPLE_ADDRESS,
        fee: "0.5",
        status: "success",
      };

      const result = toPublicConfirmation(confirmation);
      expect(result.hash).toBe(SAMPLE_HASH);
      expect(result.amount).toBe("100");
      expect(result.asset).toBe("USDC");
      expect(result.fee).toBe("0.5");
      expect(result.status).toBe("success");
      expect(result.fromAddressTruncated).toMatch(/^[A-Z]{6}\.\.\.[A-Z]{6}$/);
      expect(result.toAddressTruncated).toMatch(/^[A-Z]{6}\.\.\.[A-Z]{6}$/);
      expect(result.timestamp).toContain("1970");
    });
  });

  describe("isValidHash", () => {
    it("accepts valid 64-char hex hashes", () => {
      expect(isValidHash("a".repeat(64))).toBe(true);
      expect(isValidHash("A".repeat(64))).toBe(true);
      expect(isValidHash("0123456789abcdefABCDEF".repeat(3) + "0123")).toBe(true);
    });

    it("rejects invalid hashes", () => {
      expect(isValidHash("too-short")).toBe(false);
      expect(isValidHash("g".repeat(64))).toBe(false); // 'g' is not hex
      expect(isValidHash("a".repeat(63))).toBe(false);
      expect(isValidHash("a".repeat(65))).toBe(false);
    });
  });

  describe("getConfirmationUrl", () => {
    it("generates correct URL", () => {
      const url = getConfirmationUrl(SAMPLE_HASH);
      expect(url).toContain(`/confirm/${SAMPLE_HASH}`);
    });

    it("uses custom base URL", () => {
      const custom = "https://mybridge.com";
      const url = getConfirmationUrl(SAMPLE_HASH, custom);
      expect(url).toBe(`${custom}/confirm/${SAMPLE_HASH}`);
    });
  });

  describe("generateMetadata", () => {
    it("generates metadata with correct structure", () => {
      const confirmation = {
        hash: SAMPLE_HASH,
        amount: "100",
        asset: "USDC",
        timestamp: new Date().toISOString(),
        fromAddressTruncated: "GABCDE...UVWXYZ",
        toAddressTruncated: "GFGHIJ...STUVWX",
        fee: "0.5",
        status: "success" as const,
      };

      const metadata = generateMetadata(confirmation);
      expect(metadata.title).toContain("100");
      expect(metadata.title).toContain("USDC");
      expect(metadata.description).toContain(SAMPLE_HASH.slice(0, 8));
      expect(metadata.openGraph?.url).toContain(`/confirm/${SAMPLE_HASH}`);
      expect(metadata.twitter?.card).toBe("summary");
    });
  });
});
