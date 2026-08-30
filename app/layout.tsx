import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clarivo — Study every page. Keep every insight.',
  description: 'Clarivo is an AI study workspace that reads documents page by page, keeps questions grounded, and organizes your notes beside every page.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
