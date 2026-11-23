import type { Metadata } from "next";
import { isValidHash } from "@/lib/confirmations";

interface LayoutProps {
  children: React.ReactNode;
  // Next.js 16 makes dynamic-route params async.
  params: Promise<{
    hash: string;
  }>;
  // The network lives in the query string, so it has to be read here to keep
  // the canonical/og:url pointing at the same ledger the page renders. (#1016)
  searchParams: Promise<{
    network?: string | string[];
  }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: LayoutProps): Promise<Metadata> {
  const { hash } = await params;
  const { network: networkParam } = await searchParams;
  const network = Array.isArray(networkParam) ? networkParam[0] : networkParam;

  if (!isValidHash(hash)) {
    return {
      title: "Invalid Transaction Hash",
      description: "The transaction hash format is invalid.",
      robots: {
        index: false,
        follow: false,
      },
      alternates: {
        canonical: null,
      },
    };
  }

  // A hash alone can't say which ledger it belongs to, so the canonical URL
  // must carry the network the page actually queried. (#1016)
  const canonical = `/confirm/${hash}?network=${network === "PUBLIC" ? "PUBLIC" : "TESTNET"}`;

  return {
    title: `Transaction Confirmation | C-Address Bridge`,
    description: `View transaction confirmation for ${hash.slice(0, 8)}... on the C-Address Bridge.`,
    openGraph: {
      title: `Transaction Confirmed on C-Address Bridge`,
      description: `View transaction confirmation for ${hash.slice(0, 8)}...`,
      url: canonical,
      type: "website",
      siteName: "C-Address Bridge",
    },
    twitter: {
      card: "summary",
      title: `Transaction Confirmed on C-Address Bridge`,
      description: `View transaction confirmation for ${hash.slice(0, 8)}...`,
    },
    // See src/app/bridge/layout.tsx: without an own canonical, Next inherits
    // the root layout's homepage canonical for this route too. (#942)
    alternates: {
      canonical,
    },
  };
}

export default function Layout({ children }: LayoutProps) {
  return children;
}
