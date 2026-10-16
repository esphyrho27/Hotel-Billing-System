import type { Metadata } from 'next';
import './globals.css';
import Shell from '../components/Shell';

export const metadata: Metadata = {
  title: 'Hotel Billing System',
  description: 'Back-office hotel billing: rooms, stays, folios, payments and reports.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
