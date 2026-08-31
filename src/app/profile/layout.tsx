import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile | C-Address Bridge',
  description: 'Manage your profile and account settings.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
