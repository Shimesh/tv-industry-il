import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { InstallPrompt } from '@/components/InstallPrompt';
import ErrorBoundary from '@/components/ErrorBoundary';
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary';
import ScrollToTop from '@/components/ScrollToTop';
import AccessibilityWidget from '@/components/AccessibilityWidget';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tv-industry-il.vercel.app';
const appDescription =
  'הפלטפורמה המובילה לעובדי תעשיית הטלוויזיה בישראל - שידור חי, אלפון מקצועי, חדשות ואירועים, אולפנים ועוד';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'TV Industry IL',
    description: appDescription,
    url: '/',
    siteName: 'TV Industry IL',
    locale: 'he_IL',
    type: 'website',
  },
  title: 'TV Industry IL - פלטפורמת תעשיית הטלוויזיה הישראלית',
  description:
    'הפלטפורמה המובילה לעובדי תעשיית הטלוויזיה בישראל - שידור חי, אלפון מקצועי, חדשות ואירועים, אולפנים ועוד',
  keywords: 'טלוויזיה, ישראל, הפקה, שידור חי, אלפון, תעשייה',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TV Industry IL',
  },
};

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body
        className="antialiased min-h-screen flex flex-col app-safe-x app-safe-bottom app-ambient"
        style={{ background: 'var(--theme-bg, #030712)', color: 'var(--theme-text, #f3f4f6)' }}
        suppressHydrationWarning
      >
        <GlobalErrorBoundary>
          <Providers>
            <ScrollToTop />
            <Navigation />
            <main
              className="flex-1"
              style={{ paddingTop: 'var(--app-header-offset)', paddingBottom: 'var(--safe-area-bottom)' }}
            >
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
            <Footer />
            <ServiceWorkerRegistration />
            <InstallPrompt />
            <AccessibilityWidget />
          </Providers>
        </GlobalErrorBoundary>
      </body>
    </html>
  );
}
