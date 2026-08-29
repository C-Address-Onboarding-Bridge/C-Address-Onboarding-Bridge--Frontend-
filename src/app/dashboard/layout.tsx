import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard | C-Address Bridge',
  description: 'View your account activity and transaction history.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
