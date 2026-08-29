import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Address Book | C-Address Bridge',
  description: 'Manage your saved recipient addresses.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AddressBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
