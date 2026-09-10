import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { HOUSE } from '@/lib/house';
import { DeskAuthProvider } from '@/components/auth/AuthProvider';

// Distinctive type: Fraunces (variable display) + IBM Plex Sans (body) + JetBrains Mono (codes & balances)
const displayFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#15251f',
};

// Set NEXT_PUBLIC_APP_URL in your deployment environment; the fallback is a placeholder.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://claflin.co';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: HOUSE.title,
    template: '%s | Claflin',
  },
  description: HOUSE.description,
  keywords: ['Claflin', 'Hetty', 'tokenized stocks', 'Coinbase', 'Base', 'paper trading', 'AI broker', 'USDC'],
  icons: { icon: '/icon', shortcut: '/icon', apple: '/apple-icon' },
  authors: [{ name: 'Claflin' }],
  creator: 'Claflin',
  publisher: 'Claflin',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Claflin',
    title: HOUSE.title,
    description: HOUSE.description,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Claflin — the office above the pit. Paper trading on Coinbase Tokenized Stocks on Base.',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@claflin_broker',
    creator: '@claflin_broker',
    title: HOUSE.title,
    description: HOUSE.description,
    images: ['/opengraph-image'],
  },
  // Icons come from file conventions: app/icon.tsx (32px PNG) and
  // app/apple-icon.tsx (180px) are auto-injected by Next.js; /favicon.ico
  // is served from /public. (The old manual entries pointed at files that
  // never existed — the favicon-16x16.png 404 in the console.)
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          Base Builder Quest ownership claim for claflin.vercel.app. The
          app_id is a public, non-secret identifier — the Base dashboard
          verifies the tag, not a secret — so it lives in the source.
        */}
        <meta name="base:app_id" content="6aa21455fa92e96bd08c5ae1" />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} antialiased`}>
        {/* Skip Navigation Link for Accessibility */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-[#e7dfc9] focus:text-[#15251f] focus:rounded-sm focus:font-medium"
        >
          Skip to main content
        </a>
        
        {/*
          Optional account tier: mounts Privy only when the app is configured
          (NEXT_PUBLIC_PRIVY_APP_ID/CLIENT_ID). Otherwise this is a no-op
          context — the paper desk stays anonymous.
        */}
        <DeskAuthProvider>{children}</DeskAuthProvider>
      </body>
    </html>
  );
}
