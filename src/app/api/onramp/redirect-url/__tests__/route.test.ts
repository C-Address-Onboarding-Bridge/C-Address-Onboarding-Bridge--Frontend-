import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { createHmac } from "node:crypto";
import { POST } from "../route";

/**
 * Tests for #934: `buildProviderUrl` used to run entirely client-side with
 * no `signature`, and always targeted a Soroban C-address even though
 * MoonPay/Transak only deliver classic Stellar payments. This route builds
 * and HMAC-signs the redirect URL server-side and refuses a C-address
 * destination outright.
 */

const G_ADDRESS = Keypair.random().publicKey();
const C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());

const ORIGINAL_ENV = {
  moonpayKey: process.env.NEXT_PUBLIC_MOONPAY_API_KEY,
  moonpaySecret: process.env.MOONPAY_SECRET_KEY,
  transakKey: process.env.NEXT_PUBLIC_TRANSAK_API_KEY,
  transakSecret: process.env.TRANSAK_SECRET_KEY,
};

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/onramp/redirect-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/onramp/redirect-url (#934)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MOONPAY_API_KEY = "test-moonpay-key";
    process.env.MOONPAY_SECRET_KEY = "test-moonpay-secret";
    process.env.NEXT_PUBLIC_TRANSAK_API_KEY = "test-transak-key";
    process.env.TRANSAK_SECRET_KEY = "test-transak-secret";
  });

  afterEach(() => {
    restoreEnv("NEXT_PUBLIC_MOONPAY_API_KEY", ORIGINAL_ENV.moonpayKey);
    restoreEnv("MOONPAY_SECRET_KEY", ORIGINAL_ENV.moonpaySecret);
    restoreEnv("NEXT_PUBLIC_TRANSAK_API_KEY", ORIGINAL_ENV.transakKey);
    restoreEnv("TRANSAK_SECRET_KEY", ORIGINAL_ENV.transakSecret);
  });

  it("refuses a C-address destination with an honest message instead of signing a URL for it", async () => {
    const res = await POST(
      makeRequest({ providerId: "moonpay", address: C_ADDRESS, fiatAmount: "100" }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/C-address/);
    expect(body.url).toBeUndefined();
  });

  it("rejects an address that is neither a valid G- nor C-address", async () => {
    const res = await POST(
      makeRequest({ providerId: "moonpay", address: "not-an-address", fiatAmount: "100" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns a MoonPay URL with a valid HMAC signature for a G-address", async () => {
    const res = await POST(
      makeRequest({
        providerId: "moonpay",
        address: G_ADDRESS,
        fiatAmount: "100",
        fiatCurrency: "USD",
      }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const parsed = new URL(body.url);
    expect(parsed.origin).toBe("https://buy.moonpay.com");
    expect(parsed.searchParams.get("walletAddress")).toBe(G_ADDRESS);
    expect(parsed.searchParams.get("currencyCode")).toBe("usdc_xlm");

    const signature = parsed.searchParams.get("signature");
    expect(signature).toBeTruthy();

    // The signature must verify against the params sent (minus itself).
    parsed.searchParams.delete("signature");
    const expected = createHmac("sha256", "test-moonpay-secret")
      .update(`?${parsed.searchParams.toString()}`)
      .digest("base64");
    expect(signature).toBe(expected);
  });

  it("returns a signed Transak URL for a G-address", async () => {
    const res = await POST(
      makeRequest({ providerId: "transak", address: G_ADDRESS, fiatAmount: "50" }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const parsed = new URL(body.url);
    expect(parsed.origin).toBe("https://global.transak.com");
    expect(parsed.searchParams.get("walletAddress")).toBe(G_ADDRESS);
    expect(parsed.searchParams.get("signature")).toBeTruthy();
  });

  it("fails loudly instead of returning an unsigned URL when the secret key is missing", async () => {
    delete process.env.MOONPAY_SECRET_KEY;

    const res = await POST(
      makeRequest({ providerId: "moonpay", address: G_ADDRESS, fiatAmount: "100" }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.url).toBeUndefined();
    expect(body.error).toMatch(/MOONPAY_SECRET_KEY/);
  });

  it("rejects an unknown providerId", async () => {
    const res = await POST(
      makeRequest({ providerId: "not-a-provider", address: G_ADDRESS, fiatAmount: "100" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("rejects a malformed amount", async () => {
    const res = await POST(
      makeRequest({ providerId: "moonpay", address: G_ADDRESS, fiatAmount: "not-a-number" }) as never
    );
    expect(res.status).toBe(400);
  });
});
