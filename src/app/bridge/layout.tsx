import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'G→C Bridge | C-Address Bridge',
  description:
    'Fund Soroban smart accounts (C-addresses) directly from your G-address with a single transaction.',
  openGraph: {
    title: 'G→C Bridge',
    description:
      'Fund Soroban smart accounts (C-addresses) directly from your G-address with a single transaction.',
    url: '/bridge',
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
    title: 'G→C Bridge',
    description:
      'Fund Soroban smart accounts (C-addresses) directly from your G-address.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  // Without this, Next merges the root layout's `alternates.canonical` (the
  // homepage URL) into this route, so /bridge told search engines it was a
  // duplicate of `/`. (#942)
  alternates: {
    canonical: '/bridge',
  },
};

export default function BridgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
