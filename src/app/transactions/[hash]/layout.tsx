import type { Metadata } from 'next';

// Per-transaction pages are user-specific and must not be indexed. Without an
// own metadata export, Next inherits the root layout's `robots: index` and
// homepage canonical for this route. (#1016)
export const metadata: Metadata = {
  title: 'Transaction | C-Address Bridge',
  description: 'View the status of a C-Address Bridge transaction.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: null,
  },
};

export default function TransactionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
