/**
 * Transaction confirmation management for shareable links.
 *
 * Generates public confirmation pages addressed by transaction hash.
 * Shows amount, asset, timestamp, and truncated parties without private data.
 */

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
    timestamp: new Date(confirmation.timestamp).toISOString(),
    fromAddressTruncated: truncateAddress(confirmation.fromAddress),
    toAddressTruncated: truncateAddress(confirmation.toAddress),
    fee: confirmation.fee,
    status: confirmation.status,
  };
}

export function isValidHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/.test(hash.toLowerCase());
}

export function getConfirmationUrl(hash: string, baseUrl: string = "https://c-address-bridge.example.com"): string {
  return `${baseUrl}/confirm/${hash}`;
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
