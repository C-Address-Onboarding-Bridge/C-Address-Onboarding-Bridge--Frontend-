/**
 * Transaction confirmation management for shareable links.
 *
 * Generates public confirmation pages addressed by transaction hash.
 * Shows amount, asset, timestamp, and truncated parties without private data.
 */
import type { StellarNetwork } from "./types";

export interface TransactionConfirmation {
  hash: string;
  amount: string;
  asset: string;
  timestamp: number;
  fromAddress: string;
  toAddress: string;
  fee: string;
  status: "success" | "pending" | "failed";
}

export interface PublicConfirmation {
  hash: string;
  amount: string;
  asset: string;
  timestamp: string;
  fromAddressTruncated: string;
  toAddressTruncated: string;
  fee: string;
  status: "success" | "pending" | "failed";
}

export function truncateAddress(address: string, visibleChars: number = 6): string {
  if (address.length <= visibleChars * 2) {
    return address;
  }
  return `${address.slice(0, visibleChars)}...${address.slice(-visibleChars)}`;
}

export function toPublicConfirmation(confirmation: TransactionConfirmation): PublicConfirmation {
  return {
    hash: confirmation.hash,
    amount: confirmation.amount,
    asset: confirmation.asset,
    timestamp: new Date(confirmation.timestamp / 1000).toISOString(),
    fromAddressTruncated: truncateAddress(confirmation.fromAddress),
    toAddressTruncated: truncateAddress(confirmation.toAddress),
    fee: confirmation.fee,
    status: confirmation.status,
  };
}

export function isValidHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/.test(hash.toLowerCase());
}

/**
 * Builds a shareable confirmation URL. `network` must be included (#676) —
 * the confirmation route has no other way to know which Horizon ledger to
 * look the transaction up on, and the same hash format can't tell testnet
 * and mainnet transactions apart on its own.
 */
export function getConfirmationUrl(
  hash: string,
  network: StellarNetwork,
  baseUrl: string = "https://c-address-bridge.example.com"
): string {
  return `${baseUrl}/confirm/${hash}?network=${network}`;
}

export function generateMetadata(confirmation: PublicConfirmation) {
  const title = `Transaction Confirmed: ${confirmation.amount} ${confirmation.asset}`;
  const description = `Transaction ${confirmation.hash.slice(0, 8)}... from ${confirmation.fromAddressTruncated} to ${confirmation.toAddressTruncated}. Completed on ${new Date(confirmation.timestamp).toLocaleDateString()}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article" as const,
      url: `https://c-address-bridge.example.com/confirm/${confirmation.hash}`,
    },
    twitter: {
      card: "summary" as const,
      title,
      description,
    },
  };
}
