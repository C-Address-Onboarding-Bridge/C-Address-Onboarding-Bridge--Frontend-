import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fiat Onramp | C-Address Bridge',
  description:
    'Buy crypto with a credit card via Moonpay or Transak and send directly to your Soroban smart account.',
  openGraph: {
    title: 'Fiat Onramp',
    description:
      'Buy crypto with a credit card and send directly to your Soroban smart account.',
    url: 'https://c-address-bridge.example.com/onramp',
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
    title: 'Fiat Onramp',
    description:
      'Buy crypto with a credit card and send to your Soroban smart account.',
    images: ['https://c-address-bridge.example.com/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function OnrampLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
