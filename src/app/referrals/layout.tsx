import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Referrals | C-Address Bridge',
  description: 'Share your referral link and track your referral rewards.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReferralsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}