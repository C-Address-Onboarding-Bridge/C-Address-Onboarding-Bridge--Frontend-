// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { signClaimProof } from "@/lib/stellar";

/**
 * Tests for signClaimProof (#672) — proves the connected wallet controls the
 * claimant account before a lock claim is sent, replacing the previous
 * unauthenticated `{ claimant, network }` POST.
 *
 * Exercises the e2e test hook's path (#669: window.__E2E_WALLET__, checked
 * before any real wallet-kit call), since that's a real, deterministic
 * ed25519 signature — not a mock standing in for one — over a real message,
 * verifiable with the same keypair's own .verify().
 */

declare global {
  interface Window {
    __E2E_WALLET__?: {
      address: string;
      secret: string;
      network: "TESTNET" | "PUBLIC";
      walletId: string;
      shouldRejectSign?: boolean;
    };
  }
}

afterEach(() => {
  delete window.__E2E_WALLET__;
});

describe("signClaimProof", () => {
  it("signs a message the claimant's own keypair can verify", async () => {
    const keypair = Keypair.random();
    window.__E2E_WALLET__ = {
      address: keypair.publicKey(),
      secret: keypair.secret(),
      network: "TESTNET",
      walletId: "freighter",
    };

    const proof = await signClaimProof(keypair.publicKey(), "lock-1", "TESTNET");

    expect(proof.message).toContain("lock-1");
    expect(proof.message).toContain(keypair.publicKey());
    expect(proof.signerAddress).toBe(keypair.publicKey());
    expect(keypair.verify(Buffer.from(proof.message, "utf-8"), Buffer.from(proof.signature, "base64"))).toBe(true);
  });

  it("produces a signature a different keypair cannot verify (proves control, not just format)", async () => {
    const keypair = Keypair.random();
    const impostor = Keypair.random();
    window.__E2E_WALLET__ = {
      address: keypair.publicKey(),
      secret: keypair.secret(),
      network: "TESTNET",
      walletId: "freighter",
    };

    const proof = await signClaimProof(keypair.publicKey(), "lock-1", "TESTNET");

    expect(impostor.verify(Buffer.from(proof.message, "utf-8"), Buffer.from(proof.signature, "base64"))).toBe(false);
  });

  it("rejects when the wallet declines to sign", async () => {
    const keypair = Keypair.random();
    window.__E2E_WALLET__ = {
      address: keypair.publicKey(),
      secret: keypair.secret(),
      network: "TESTNET",
      walletId: "freighter",
      shouldRejectSign: true,
    };

    await expect(signClaimProof(keypair.publicKey(), "lock-1", "TESTNET")).rejects.toThrow("User declined access");
  });
});
