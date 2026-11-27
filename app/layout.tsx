import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Tamil, Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';
import { currentLocale } from '@/lib/i18n/server';
import { htmlLang } from '@/lib/i18n/locales';
import { LocaleProvider } from '@/components/i18n/locale-provider';
import { PwaShell } from '@/components/pwa/pwa-shell';
import './globals.css';

const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const ui = Inter({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
// Noto Sans Tamil is under the SIL Open Font License, which permits embedding and redistribution.
const tamil = Noto_Sans_Tamil({ subsets: ['tamil'], variable: '--font-tamil', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'ZENTRO BuildMart', template: '%s | ZENTRO BuildMart' },
  description: 'Digital showroom and store management for construction retail.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'ZENTRO BuildMart', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.ico?v=2', sizes: 'any' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#6A0D2A',
  width: 'device-width',
  initialScale: 1,
};

/**
 * The language cookie is read here, so the document carries the right lang attribute for every portal.
 * Reading cookies makes the app render per request.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  return (
    <html lang={htmlLang(locale)} className={`${display.variable} ${ui.variable} ${tamil.variable}`}>
      <body className="min-h-screen bg-cream font-sans text-ink antialiased">
        <LocaleProvider locale={locale}>
          {children}
          <PwaShell />
        </LocaleProvider>
      </body>
    </html>
  );
}
