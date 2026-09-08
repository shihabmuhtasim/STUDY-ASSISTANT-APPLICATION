import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NoteMyDoc AI — Chat with every page. Keep every note.',
  description: 'NoteMyDoc AI is a page-by-page document study workspace with full-document context, connected notes, annotations, and AI assistance.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var saved=localStorage.getItem('notemydoc-theme');var theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){}})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
