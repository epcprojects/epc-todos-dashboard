import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Today’s posts',
  robots: { index: false, follow: false },
  // the secret is in the address: never send it to other sites
  referrer: 'no-referrer',
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
