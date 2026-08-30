import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Study Assistant',
  description: 'Read documents, use OCR, build page or whole-document notes, and study with a document-aware AI assistant.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
