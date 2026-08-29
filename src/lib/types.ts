export type AddressType = "G" | "C";

export interface WalletState {
  address: string | null;
  publicKey: string | null;
  network: StellarNetwork;
  isConnected: boolean;
}

/**
 * Lifecycle state of a bridge transaction.
 *
 * Named rather than inlined so every producer and consumer references one
 * cached union instead of re-declaring (and making the checker re-instantiate)
 * a structurally identical anonymous one. It also means adding a state is a
 * one-line change that the compiler propagates everywhere. (#346)
 */
export type BridgeTransactionStatus = "pending" | "confirmed" | "failed";

/** How funds reached the destination C-address. */
export type BridgeTransactionKind = "g-to-c" | "fiat" | "cex";

/** Fiat on-ramp providers the app can quote against. */
export type OnrampProvider = "moonpay" | "transak";

export interface BridgeTransactionData {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
  status: BridgeTransactionStatus;
  timestamp: number;
  type: BridgeTransactionKind;
  hash?: string;
  memo?: string;
}

export interface Balance {
  asset: string;
  amount: string;
  contractId?: string;
}

export interface OnrampQuote {
  sourceAmount: string;
  destinationAmount: string;
  fee: string;
  provider: OnrampProvider;
  fiatCurrency: string;
  cryptoCurrency: string;
}

export interface CexConfig {
  readonly name: string;
  readonly logo: string;
  readonly supportedNetworks: readonly string[];
  readonly minWithdrawal: string;
  readonly fee: string;
  readonly withdrawalUrl: string;
}

export const STELLAR_NETWORK = {
  PUBLIC: "PUBLIC",
  TESTNET: "TESTNET",
} as const;

/** The set of supported Stellar network identifiers. */
export type StellarNetwork = keyof typeof STELLAR_NETWORK;

/**
 * The networks this app is able to transact on. Alias of {@link StellarNetwork},
 * kept as a distinct name because it reads more clearly next to
 * {@link WalletNetworkState}, where "the app's networks" and "whatever the
 * wallet happens to be on" are genuinely different sets. (#289)
 */
export type AppNetwork = StellarNetwork;

/**
 * Everything the wallet's network can actually be, from the app's point of view:
 *
 * - `"PUBLIC"` / `"TESTNET"` — a network the app supports
 * - `"UNSUPPORTED"` — the wallet reported a real network the app can't use
 *   (Futurenet, Standalone, a custom passphrase…)
 * - `"UNKNOWN"` — the network could not be read from the wallet at all
 *
 * The last two must stay distinct from `"TESTNET"`: coercing them silently made
 * a Futurenet wallet look like a genuine testnet session, so the app queried the
 * wrong Horizon and built transactions with the wrong passphrase. (#289)
 */
export type WalletNetworkState = AppNetwork | "UNSUPPORTED" | "UNKNOWN";

/** Narrows a wallet network state to one the app can build transactions on. */
export function isSupportedNetwork(state: WalletNetworkState): state is AppNetwork {
  return state === "PUBLIC" || state === "TESTNET";
}

// SDF does not operate a free public mainnet Soroban RPC, so PUBLIC must be
// configured explicitly; getSorobanRpcServer throws a clear error if it's
// unset rather than resolving to a non-existent hostname. TESTNET defaults to
// the official SDF endpoint but can still be overridden per-environment.
export const SOROBAN_RPC_URL = {
  PUBLIC: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_PUBLIC ?? "",
  TESTNET: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET ?? "https://soroban-testnet.stellar.org",
} as const;

export const HORIZON_URL = {
  PUBLIC: "https://horizon.stellar.org",
  TESTNET: "https://horizon-testnet.stellar.org",
} as const;

export const BRIDGE_CONTRACT_ID = process.env.NEXT_PUBLIC_BRIDGE_CONTRACT_ID || "";

/**
 * Maximum number of recipients accepted in a single batch_fund_c_address
 * call (#465).
 *
 * TODO: this is a placeholder. This repo does not vendor the batch contract
 * source or the batch API client, and no existing constant defines the real
 * cap — replace this with the actual contract/API limit once it's available,
 * and update the UI copy that references it (currently derived from this
 * constant, so no other change should be needed).
 */
export const MAX_BATCH_RECIPIENTS = 25;

/**
 * The Stellar network the app connects to. Driven by the `NEXT_PUBLIC_STELLAR_NETWORK`
 * environment variable. Any value other than `"PUBLIC"` (exact, case-sensitive)
 * falls back to `"TESTNET"` so misconfigured deployments never silently send
 * real funds on mainnet.
 *
 * Set in your .env.local:
 *   NEXT_PUBLIC_STELLAR_NETWORK=PUBLIC   # mainnet
 *   NEXT_PUBLIC_STELLAR_NETWORK=TESTNET  # testnet (default)
 */
export const APP_NETWORK: "PUBLIC" | "TESTNET" =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "PUBLIC" ? "PUBLIC" : "TESTNET";

/**
 * The exchanges shown on /cex.
 *
 * `as const satisfies` rather than a `: CexConfig[]` annotation: the shape is
 * still checked against {@link CexConfig}, but the literal types survive, so
 * `CEX_LIST[0].name` is `"Binance"` instead of `string`, and the whole
 * structure is frozen at the type level — no widening pass, no accidental
 * `CEX_LIST.push(...)` from a component. (#346)
 */
export const CEX_LIST = [
  {
    name: "Binance",
    logo: "/cex/binance.svg",
    supportedNetworks: ["Stellar"],
    minWithdrawal: "10 USDC",
    fee: "0.1 USDC",
    withdrawalUrl: "https://www.binance.com/en/withdraw",
  },
  {
    name: "Coinbase",
    logo: "/cex/coinbase.svg",
    supportedNetworks: ["Stellar", "Polygon"],
    minWithdrawal: "5 USDC",
    fee: "0.05 USDC",
    withdrawalUrl: "https://www.coinbase.com/withdraw",
  },
  {
    name: "Kraken",
    logo: "/cex/kraken.svg",
    supportedNetworks: ["Stellar"],
    minWithdrawal: "15 USDC",
    fee: "0.15 USDC",
    withdrawalUrl: "https://www.kraken.com/withdraw",
  },
] as const satisfies readonly CexConfig[];
