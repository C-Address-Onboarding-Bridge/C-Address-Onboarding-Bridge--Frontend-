import type { Metadata } from 'next';

// The embeddable widget is meant to be iframed by third-party hosts, not
// indexed as a standalone page. Without an own metadata export, Next inherits
// the root layout's `robots: index` and homepage canonical for this route.
// (#1016)
export const metadata: Metadata = {
  title: 'Funding Widget | C-Address Bridge',
  description: 'Embeddable C-Address Bridge funding widget.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: null,
  },
};

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
