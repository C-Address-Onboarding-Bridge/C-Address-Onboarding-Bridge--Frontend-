import { describe, it, expect } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { parseWidgetConfig } from "@/lib/widget";

const keypair = Keypair.random();
const VALID_C_ADDRESS = StrKey.encodeContract(keypair.rawPublicKey());

function baseParams(extra: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    address: VALID_C_ADDRESS,
    parentOrigin: "https://example.com",
    ...extra,
  });
}

// #941: isStellarNetwork used `value in STELLAR_NETWORK`, which walks the
// prototype chain, so inherited Object.prototype keys ("constructor",
// "toString", "valueOf", "__proto__", "hasOwnProperty") passed and silently
// resolved to TESTNET instead of being rejected.
describe("parseWidgetConfig network handling (src/lib/widget.ts)", () => {
  it("defaults to TESTNET when network is omitted entirely", () => {
    const result = parseWidgetConfig(baseParams());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.network).toBe("TESTNET");
  });

  it.each(["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"])(
    "rejects the prototype-chain value %s instead of defaulting to TESTNET",
    (badValue) => {
      const result = parseWidgetConfig(baseParams({ network: badValue }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/network must be one of/);
    }
  );

  it("rejects an unrelated unknown value such as 'mainnet' (wrong case)", () => {
    const result = parseWidgetConfig(baseParams({ network: "mainnet" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/network must be one of/);
  });

  it("accepts the real network values", () => {
    const pub = parseWidgetConfig(baseParams({ network: "PUBLIC" }));
    expect(pub.ok).toBe(true);
    if (pub.ok) expect(pub.config.network).toBe("PUBLIC");

    const test = parseWidgetConfig(baseParams({ network: "TESTNET" }));
    expect(test.ok).toBe(true);
    if (test.ok) expect(test.config.network).toBe("TESTNET");
  });
});
