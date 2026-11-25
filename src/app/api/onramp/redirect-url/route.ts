import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isCAddress, isGAddress } from "@/lib/stellar";
import { providers } from "@/lib/onrampProviders";

/**
 * Server-side, signed on-ramp provider redirect URLs (#934).
 *
 * `buildProviderUrl` in `src/components/routes/onramp-page.tsx` used to run
 * entirely client-side and put the provider's publishable `apiKey` and the
 * destination wallet address straight into the query string with no
 * `signature` param. MoonPay requires URLs that pre-set `walletAddress` to be
 * HMAC-signed server-side with the provider's secret key — an unsigned URL
 * is either rejected outright, or (with signature verification disabled on
 * the MoonPay dashboard) lets anyone who intercepts or replays the link
 * rewrite `walletAddress` to their own.
 *
 * This route builds and signs that URL instead, so the secret key never
 * reaches the browser. It also re-validates the destination address itself:
 * MoonPay/Transak deliver `usdc_xlm` as a classic Stellar payment (a `G...`
 * account), which cannot target a Soroban contract address — the same
 * limitation `src/app/bridge/page.tsx` documents and blocks on for G → C
 * bridging (#284). A `C...` destination is refused here with the same honest
 * "not available yet" message rather than producing a signed URL that will
 * only strand the user's funds.
 *
 * PLACEHOLDER SIGNING SCHEME: this repo has no existing MoonPay/Transak
 * server integration to copy. MoonPay's own documented scheme — base64 of
 * HMAC-SHA256(secretKey, "?" + queryString) appended as `signature` — is
 * implemented for both providers for consistency; Transak's exact
 * requirements must be reconciled against their dashboard config once this
 * repo actually has Transak server credentials.
 */

const CADDRESS_UNAVAILABLE_MESSAGE =
  "Card purchases can't be delivered to a Soroban C-address yet: MoonPay and Transak only deliver classic Stellar (G-address) payments, and the on-chain transfer path from a G-address to a C-address hasn't shipped. Follow progress in issue #284.";

interface RedirectUrlRequestBody {
  providerId?: unknown;
  address?: unknown;
  fiatAmount?: unknown;
  fiatCurrency?: unknown;
}

function signQueryString(secretKey: string, queryString: string): string {
  return createHmac("sha256", secretKey).update(`?${queryString}`).digest("base64");
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RedirectUrlRequestBody;
  try {
    body = (await request.json()) as RedirectUrlRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { providerId, address, fiatAmount, fiatCurrency } = body;

  if (typeof providerId !== "string") {
    return NextResponse.json({ error: "providerId is required." }, { status: 400 });
  }
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider '${providerId}'.` }, { status: 400 });
  }

  if (typeof address !== "string" || !address) {
    return NextResponse.json({ error: "address is required." }, { status: 400 });
  }
  // Blocked before anything else: a contract address can't receive what
  // either provider delivers, signed or not. (#934)
  if (isCAddress(address)) {
    return NextResponse.json({ error: CADDRESS_UNAVAILABLE_MESSAGE }, { status: 400 });
  }
  if (!isGAddress(address)) {
    return NextResponse.json(
      { error: "Invalid destination address (must be a valid Stellar G-address)." },
      { status: 400 }
    );
  }

  if (typeof fiatAmount !== "string" || !/^\d+(\.\d{1,2})?$/.test(fiatAmount)) {
    return NextResponse.json({ error: "Invalid amount format." }, { status: 400 });
  }

  const currency = typeof fiatCurrency === "string" && fiatCurrency ? fiatCurrency : "USD";
  if (!provider.currencies.includes(currency)) {
    return NextResponse.json({ error: `${provider.name} does not support ${currency}.` }, { status: 400 });
  }

  if (!provider.apiKey) {
    return NextResponse.json({ error: `${provider.name} API key is not configured.` }, { status: 500 });
  }

  const secretEnvVar = provider.id === "moonpay" ? "MOONPAY_SECRET_KEY" : "TRANSAK_SECRET_KEY";
  const secretKey = process.env[secretEnvVar];
  if (!secretKey) {
    // Never fall back to returning an unsigned URL (#934) — fail loudly
    // instead so a missing secret is caught in config, not in production.
    return NextResponse.json(
      { error: `${secretEnvVar} is not configured; cannot sign the redirect URL.` },
      { status: 500 }
    );
  }

  const params =
    provider.id === "moonpay"
      ? new URLSearchParams({
          apiKey: provider.apiKey,
          walletAddress: address,
          currencyCode: "usdc_xlm",
          baseCurrencyAmount: fiatAmount,
          baseCurrencyCode: currency.toLowerCase(),
        })
      : new URLSearchParams({
          apiKey: provider.apiKey,
          walletAddress: address,
          network: "stellar",
          defaultCryptoCurrency: "USDC",
          defaultFiatAmount: fiatAmount,
          fiatCurrency: currency,
        });

  const signature = signQueryString(secretKey, params.toString());
  params.set("signature", signature);

  return NextResponse.json({ url: `${provider.baseUrl}?${params.toString()}` });
}
