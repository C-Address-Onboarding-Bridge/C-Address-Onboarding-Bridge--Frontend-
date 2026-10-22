/**
 * Network scoping helpers for locally stored data (#693). Kept free of any
 * Stellar SDK import so storage modules stay lightweight.
 */
export type StellarNetwork = "mainnet" | "testnet";

/** Resolves the configured network; defaults to `mainnet` like the address book. */
export function getNetwork(): StellarNetwork {
  const raw = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  return raw?.toLowerCase() === "testnet" ? "testnet" : "mainnet";
}

/** Maps a storage network to the `TESTNET` / `PUBLIC` form used in funding links. */
export function toLinkNetwork(network: StellarNetwork): "TESTNET" | "PUBLIC" {
  return network === "testnet" ? "TESTNET" : "PUBLIC";
}
