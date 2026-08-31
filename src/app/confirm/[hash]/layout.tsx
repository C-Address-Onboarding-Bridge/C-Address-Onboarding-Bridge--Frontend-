import type { Metadata } from "next";
import { isValidHash } from "@/lib/confirmations";

interface LayoutProps {
  children: React.ReactNode;
  params: {
    hash: string;
  };
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { hash } = params;

  if (!isValidHash(hash)) {
    return {
      title: "Invalid Transaction Hash",
      description: "The transaction hash format is invalid.",
    };
  }

  return {
    title: `Transaction Confirmation | C-Address Bridge`,
    description: `View transaction confirmation for ${hash.slice(0, 8)}... on the C-Address Bridge.`,
    openGraph: {
      title: `Transaction Confirmed on C-Address Bridge`,
      description: `View transaction confirmation for ${hash.slice(0, 8)}...`,
      url: `https://c-address-bridge.example.com/confirm/${hash}`,
      type: "website",
      siteName: "C-Address Bridge",
    },
    twitter: {
      card: "summary",
      title: `Transaction Confirmed on C-Address Bridge`,
      description: `View transaction confirmation for ${hash.slice(0, 8)}...`,
    },
  };
}

export default function Layout({ children }: LayoutProps) {
  return children;
}
