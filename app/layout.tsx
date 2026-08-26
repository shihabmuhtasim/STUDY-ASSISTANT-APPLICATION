import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Study Assistant',
  description: 'Read PDFs, build page-linked notes, and study with a page-aware AI assistant.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
