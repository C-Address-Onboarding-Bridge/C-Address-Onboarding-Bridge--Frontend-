import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scheduled Transfers | C-Address Bridge',
  description: 'Manage your recurring and scheduled C-address transfers.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SchedulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}