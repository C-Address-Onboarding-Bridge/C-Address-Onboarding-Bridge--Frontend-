const MOONPAY_API_KEY = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
const TRANSAK_API_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY || "";

// Single source of truth for on-ramp provider id/name/fee/limits/currencies,
// shared by the on-ramp page, `src/lib/onrampQuotes.ts` (#556) and the
// `/api/onramp/quotes` route. Kept in lib/ so none of them depends on UI code (#721).
export const providers = [
  {
    id: "moonpay",
    name: "Moonpay",
    description: "Buy with credit/debit card",
    fee: "4.5%",
    limits: "$20 - $10,000",
    currencies: ["USD", "EUR", "GBP"],
    supported: true,
    apiKey: MOONPAY_API_KEY,
    baseUrl: "https://buy.moonpay.com",
  },
  {
    id: "transak",
    name: "Transak",
    description: "Buy with card, Apple Pay, Google Pay",
    fee: "5%",
    limits: "$15 - $25,000",
    currencies: ["USD", "EUR", "GBP", "INR"],
    supported: true,
    apiKey: TRANSAK_API_KEY,
    baseUrl: "https://global.transak.com",
  },
];

export function getProviderFeeRate(providerId: string): number {
  return providerId === "moonpay" ? 0.045 : 0.05;
}

export function calculateOnrampFeeAndReceive(amount: number, providerId: string) {
  const feeRate = getProviderFeeRate(providerId);
  const fee = amount * feeRate;
  const receive = amount - fee;
  return { feeRate, fee, receive };
}
