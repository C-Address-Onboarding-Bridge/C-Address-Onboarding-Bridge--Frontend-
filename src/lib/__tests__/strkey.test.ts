import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { StrKey } from "@stellar/stellar-sdk";
import { isValidContract, isValidEd25519PublicKey } from "../strkey";

describe("lazy Stellar StrKey validation", () => {
  it("validates account and contract keys without importing the SDK at runtime", () => {
    const payload = Buffer.alloc(32, 7);
    const account = StrKey.encodeEd25519PublicKey(payload);
    const contract = StrKey.encodeContract(payload);

    expect(isValidEd25519PublicKey(account)).toBe(true);
    expect(isValidContract(contract)).toBe(true);
    expect(isValidEd25519PublicKey(contract)).toBe(false);
    expect(isValidContract(account)).toBe(false);
    expect(isValidEd25519PublicKey(`${account.slice(0, -1)}A`)).toBe(false);
  });
});
