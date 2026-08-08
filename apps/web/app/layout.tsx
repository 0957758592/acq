import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Nav } from '@/features/nav/Nav';

export const metadata: Metadata = {
  title: 'ACQ Console',
  description: 'Callable targets, output telemetry and AI comments'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
