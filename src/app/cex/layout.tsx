import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CEX Withdrawal | C-Address Bridge',
  description:
    'Route exchange withdrawals directly to your Soroban smart account without requiring a G-address.',
  openGraph: {
    title: 'CEX Withdrawal',
    description:
      'Route exchange withdrawals directly to your Soroban smart account.',
    url: '/cex',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'C-Address Bridge',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CEX Withdrawal',
    description:
      'Route exchange withdrawals directly to your Soroban smart account.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  // See bridge/layout.tsx: without an own canonical, Next inherits the root
  // layout's homepage canonical for this route too. (#942)
  alternates: {
    canonical: '/cex',
  },
};

export default function CexLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
