import { describe, it, expect } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  buildFundingLink,
  parseFundingLink,
  hasFundingLinkParams,
} from "@/lib/fundingLink";

// Generate real checksum-valid addresses for test fixtures
const keypair = Keypair.random();
const VALID_G_ADDRESS = keypair.publicKey();
const VALID_C_ADDRESS = StrKey.encodeContract(keypair.rawPublicKey());
// A clearly malformed address
const INVALID_ADDRESS = "XNOTANADDRESS";

// ---------------------------------------------------------------------------
// buildFundingLink
// ---------------------------------------------------------------------------

describe("buildFundingLink", () => {
  it("encodes the target address as a query parameter", () => {
    const url = buildFundingLink("https://example.com/bridge", {
      target: VALID_C_ADDRESS,
    });
    expect(url).toContain(`target=${VALID_C_ADDRESS}`);
    expect(url.startsWith("https://example.com/bridge")).toBe(true);
  });

  it("includes amount when provided", () => {
    const url = buildFundingLink("https://example.com/bridge", {
      target: VALID_C_ADDRESS,
      amount: "10.5",
    });
    expect(url).toContain("amount=10.5");
  });

  it("omits amount when not provided", () => {
    const url = buildFundingLink("https://example.com/bridge", {
      target: VALID_C_ADDRESS,
    });
    expect(url).not.toContain("amount=");
  });

  it("includes asset when it is not XLM", () => {
    const url = buildFundingLink("https://example.com/bridge", {
      target: VALID_C_ADDRESS,
      asset: "USDC",
    });
    expect(url).toContain("asset=USDC");
  });

  it("omits asset param when it is XLM (default)", () => {
    const url = buildFundingLink("https://example.com/bridge", {
      target: VALID_C_ADDRESS,
      asset: "XLM",
    });
    expect(url).not.toContain("asset=");
  });

  it("works with a G-address as target", () => {
    const url = buildFundingLink("https://example.com/bridge", {
      target: VALID_G_ADDRESS,
    });
    expect(url).toContain(`target=${VALID_G_ADDRESS}`);
  });
});

// ---------------------------------------------------------------------------
// parseFundingLink
// ---------------------------------------------------------------------------

describe("parseFundingLink", () => {
  it("returns ok=true for a valid C-address target", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.target).toBe(VALID_C_ADDRESS);
    }
  });

  it("returns ok=true for a valid G-address target", () => {
    const params = new URLSearchParams({ target: VALID_G_ADDRESS });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(true);
  });

  it("parses optional amount", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS, amount: "25" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.amount).toBe("25");
    }
  });

  it("parses optional asset", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS, asset: "USDC" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.asset).toBe("USDC");
    }
  });

  it("normalises asset to upper-case", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS, asset: "usdc" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.asset).toBe("USDC");
    }
  });

  it("returns error MISSING_TARGET when target param is absent", () => {
    const params = new URLSearchParams({ amount: "10" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("MISSING_TARGET");
    }
  });

  it("returns error MISSING_TARGET for null searchParams", () => {
    const result = parseFundingLink(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("MISSING_TARGET");
    }
  });

  it("returns error INVALID_TARGET for a malformed address", () => {
    const params = new URLSearchParams({ target: INVALID_ADDRESS });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_TARGET");
    }
  });

  it("returns error INVALID_TARGET for an empty target string", () => {
    const params = new URLSearchParams({ target: "" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("MISSING_TARGET");
    }
  });

  it("returns error INVALID_AMOUNT for a negative amount", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS, amount: "-5" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_AMOUNT");
    }
  });

  it("returns error INVALID_AMOUNT for an amount with more than 7 decimal places", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS, amount: "1.12345678" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_AMOUNT");
    }
  });

  it("returns error INVALID_AMOUNT for zero", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS, amount: "0" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_AMOUNT");
    }
  });

  it("returns error INVALID_ASSET for an unknown asset", () => {
    const params = new URLSearchParams({ target: VALID_C_ADDRESS, asset: "SHITCOIN" });
    const result = parseFundingLink(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_ASSET");
    }
  });

  it("round-trips with buildFundingLink", () => {
    const generated = buildFundingLink("https://example.com/bridge", {
      target: VALID_C_ADDRESS,
      amount: "5.5",
      asset: "USDC",
    });
    const url = new URL(generated);
    const result = parseFundingLink(url.searchParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.target).toBe(VALID_C_ADDRESS);
      expect(result.params.amount).toBe("5.5");
      expect(result.params.asset).toBe("USDC");
    }
  });
});

// ---------------------------------------------------------------------------
// hasFundingLinkParams
// ---------------------------------------------------------------------------

describe("hasFundingLinkParams", () => {
  it("returns true when target is present", () => {
    expect(hasFundingLinkParams(new URLSearchParams({ target: VALID_C_ADDRESS }))).toBe(true);
  });

  it("returns true when only amount is present", () => {
    expect(hasFundingLinkParams(new URLSearchParams({ amount: "10" }))).toBe(true);
  });

  it("returns false when no relevant params are present", () => {
    expect(hasFundingLinkParams(new URLSearchParams({ foo: "bar" }))).toBe(false);
  });

  it("returns false for null", () => {
    expect(hasFundingLinkParams(null)).toBe(false);
  });
});
