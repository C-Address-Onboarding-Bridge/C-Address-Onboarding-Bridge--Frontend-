import type { Metadata } from 'next';

// Per-transaction receipts are user-specific and must not be indexed. Without
// an own metadata export, Next inherits the root layout's `robots: index` and
// homepage canonical for this route. (#1016)
export const metadata: Metadata = {
  title: 'Receipt | C-Address Bridge',
  description: 'View a C-Address Bridge transaction receipt.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: null,
  },
};

export default function ReceiptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
