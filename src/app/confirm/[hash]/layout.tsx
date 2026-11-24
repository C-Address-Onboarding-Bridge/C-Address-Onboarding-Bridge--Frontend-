import type { Metadata } from "next";
import { isValidHash } from "@/lib/confirmations";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    hash: string;
  }>;
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { hash } = await params;

  if (!isValidHash(hash)) {
    return {
      title: "Invalid Transaction Hash",
      description: "The transaction hash format is invalid.",
    };
  }

  return {
    title: "Transaction Details | C-Address Bridge",
    description: `View transaction details for ${hash.slice(0, 8)}... on the C-Address Bridge.`,
    openGraph: {
      title: "Transaction Details on C-Address Bridge",
      description: `View transaction details for ${hash.slice(0, 8)}...`,
      url: `/confirm/${hash}`,
      type: "website",
      siteName: "C-Address Bridge",
    },
    twitter: {
      card: "summary",
      title: "Transaction Details on C-Address Bridge",
      description: `View transaction details for ${hash.slice(0, 8)}...`,
    },
    alternates: {
      canonical: `/confirm/${hash}`,
    },
  };
}

export default function Layout({ children }: LayoutProps) {
  return children;
}