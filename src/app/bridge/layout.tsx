import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'G→C Bridge | C-Address Bridge',
  description:
    'Fund Soroban smart accounts (C-addresses) directly from your G-address with a single transaction.',
  openGraph: {
    title: 'G→C Bridge',
    description:
      'Fund Soroban smart accounts (C-addresses) directly from your G-address with a single transaction.',
    url: 'https://c-address-bridge.example.com/bridge',
    type: 'website',
    images: [
      {
        url: 'https://c-address-bridge.example.com/og-image.png',
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
    images: ['https://c-address-bridge.example.com/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function BridgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
