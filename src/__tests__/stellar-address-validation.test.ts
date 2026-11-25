import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { isCAddress, isGAddress, isValidStellarAddress } from "@/lib/stellar";

/**
 * #849: stellar.ts called isValidEd25519PublicKey / isValidContract without
 * importing them, so every address check threw ReferenceError. These run
 * against the real module, with nothing mocked.
 *
 * #846: stellar.ts imported @stellar/freighter-api (twice) although the
 * package is no longer a dependency.
 */

const G_ADDRESS = Keypair.random().publicKey();
const C_ADDRESS = StrKey.encodeContract(Buffer.from(Keypair.random().rawPublicKey()));

describe("address validation without mocks (#849)", () => {
  it("accepts a valid G-address and a valid C-address", () => {
    expect(isValidStellarAddress(G_ADDRESS)).toBe(true);
    expect(isValidStellarAddress(C_ADDRESS)).toBe(true);
  });

  it("rejects garbage without throwing", () => {
    for (const value of ["", "garbage", "G123", G_ADDRESS.slice(0, -1) + "A", C_ADDRESS.toLowerCase()]) {
      expect(() => isValidStellarAddress(value)).not.toThrow();
      expect(isValidStellarAddress(value)).toBe(false);
    }
  });

  it("tells G- and C-addresses apart", () => {
    expect(isGAddress(G_ADDRESS)).toBe(true);
    expect(isGAddress(C_ADDRESS)).toBe(false);
    expect(isCAddress(C_ADDRESS)).toBe(true);
    expect(isCAddress(G_ADDRESS)).toBe(false);
  });
});

describe("no @stellar/freighter-api dependency (#846)", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

  it("is not imported by stellar.ts", () => {
    expect(read("src/lib/stellar.ts")).not.toMatch(/from\s+["']@stellar\/freighter-api["']/);
  });

  it("is not listed in package.json or next.config.ts", () => {
    const pkg = JSON.parse(read("package.json")) as Record<string, Record<string, string> | undefined>;
    expect(pkg.dependencies?.["@stellar/freighter-api"]).toBeUndefined();
    expect(pkg.devDependencies?.["@stellar/freighter-api"]).toBeUndefined();
    expect(read("next.config.ts")).not.toContain("@stellar/freighter-api");
  });
});
