import type { Metadata } from "next";
import { isValidHash } from "@/lib/confirmations";

interface LayoutProps {
  children: React.ReactNode;
  // Next.js 16 makes dynamic-route params async.
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
    title: `Transaction Confirmation | C-Address Bridge`,
    description: `View transaction confirmation for ${hash.slice(0, 8)}... on the C-Address Bridge.`,
    openGraph: {
      title: `Transaction Confirmed on C-Address Bridge`,
      description: `View transaction confirmation for ${hash.slice(0, 8)}...`,
      url: `/confirm/${hash}`,
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
      canonical: `/confirm/${hash}`,
    },
  };
}

export default function Layout({ children }: LayoutProps) {
  return children;
}
