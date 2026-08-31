import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CEX Withdrawal | C-Address Bridge',
  description:
    'Route exchange withdrawals directly to your Soroban smart account without requiring a G-address.',
  openGraph: {
    title: 'CEX Withdrawal',
    description:
      'Route exchange withdrawals directly to your Soroban smart account.',
    url: 'https://c-address-bridge.example.com/cex',
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
    title: 'CEX Withdrawal',
    description:
      'Route exchange withdrawals directly to your Soroban smart account.',
    images: ['https://c-address-bridge.example.com/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CexLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
