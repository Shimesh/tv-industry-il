import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import Navigation from '@/components/Navigation';
import QuickMenuRoot from '@/components/QuickMenuRoot';
import ConditionalFooter from '@/components/ConditionalFooter';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { InstallPrompt } from '@/components/InstallPrompt';
import ErrorBoundary from '@/components/ErrorBoundary';
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary';
import ScrollToTop from '@/components/ScrollToTop';
import AccessibilityWidget from '@/components/AccessibilityWidget';
import PushClickTracker from '@/components/PushClickTracker';
import { Suspense } from 'react';
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
  maximumScale: 1,
  userScalable: false,
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
        {/* Android browsers and displays often render dark palettes below their authored luminance. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(/Android/i.test(navigator.userAgent||'')){document.documentElement.dataset.androidDisplay='true';}}catch(e){}})();` }} />
        {/* Apply stored theme synchronously before first paint to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('tv-industry-theme');if(!t)return;var m={'dark':{'--background':'#0e0a1f','--foreground':'#f5ecdf','--theme-bg':'#0e0a1f','--theme-bg-secondary':'#18122e','--theme-bg-card':'#211a3d','--theme-nav-bg':'rgba(14,10,31,0.94)','--theme-border':'rgba(245,236,223,0.12)','--theme-text':'#f5ecdf','--theme-text-secondary':'#b8a8c9','--theme-accent':'#e07a5f','--theme-accent-secondary':'#5fb0a8','--theme-accent-glow':'rgba(224,122,95,0.20)','--theme-success':'#22c55e','--theme-warning':'#f59e0b','--theme-danger':'#ef4444','--theme-info':'#38bdf8'},'light':{'--background':'#f6efe2','--foreground':'#2a1f1a','--theme-bg':'#f6efe2','--theme-bg-secondary':'#fbf6ec','--theme-bg-card':'#ffffff','--theme-nav-bg':'rgba(251,246,236,0.94)','--theme-border':'rgba(60,42,33,0.12)','--theme-text':'#2a1f1a','--theme-text-secondary':'#6b574a','--theme-accent':'#c84e3e','--theme-accent-secondary':'#2f7a72','--theme-accent-glow':'rgba(200,78,62,0.14)','--theme-success':'#16a34a','--theme-warning':'#d97706','--theme-danger':'#dc2626','--theme-info':'#0284c7'},'midnight':{'--background':'#0a0e2a','--foreground':'#ede4d3','--theme-bg':'#0a0e2a','--theme-bg-secondary':'#131a3d','--theme-bg-card':'#1c2453','--theme-nav-bg':'rgba(10,14,42,0.94)','--theme-border':'rgba(196,181,253,0.18)','--theme-text':'#ede4d3','--theme-text-secondary':'#a5b4d8','--theme-accent':'#f4a261','--theme-accent-secondary':'#e76f51','--theme-accent-glow':'rgba(244,162,97,0.18)','--theme-success':'#22c55e','--theme-warning':'#fbbf24','--theme-danger':'#f87171','--theme-info':'#38bdf8'},'sunset':{'--background':'#1a0e0a','--foreground':'#fbe9d3','--theme-bg':'#1a0e0a','--theme-bg-secondary':'#261611','--theme-bg-card':'#321d17','--theme-nav-bg':'rgba(26,14,10,0.94)','--theme-border':'rgba(244,162,97,0.18)','--theme-text':'#fbe9d3','--theme-text-secondary':'#d4a574','--theme-accent':'#d97757','--theme-accent-secondary':'#6b9080','--theme-accent-glow':'rgba(217,119,87,0.20)','--theme-success':'#34d399','--theme-warning':'#fb7185','--theme-danger':'#ef4444','--theme-info':'#38bdf8'},'forest':{'--background':'#0c1612','--foreground':'#f0e6d2','--theme-bg':'#0c1612','--theme-bg-secondary':'#16241d','--theme-bg-card':'#1f3329','--theme-nav-bg':'rgba(12,22,18,0.94)','--theme-border':'rgba(212,165,116,0.16)','--theme-text':'#f0e6d2','--theme-text-secondary':'#b8c5b1','--theme-accent':'#d4a574','--theme-accent-secondary':'#c84e3e','--theme-accent-glow':'rgba(212,165,116,0.18)','--theme-success':'#4ade80','--theme-warning':'#facc15','--theme-danger':'#fb7185','--theme-info':'#38bdf8'}};var v=m[t];if(!v)return;var r=document.documentElement;Object.keys(v).forEach(function(k){r.style.setProperty(k,v[k]);});r.dataset.theme=t;}catch(e){}})();` }} />
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
            <QuickMenuRoot />
            <main
              className="flex-1 overflow-x-hidden"
              style={{ paddingTop: 'var(--app-header-offset)', paddingBottom: 'var(--safe-area-bottom)' }}
            >
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
            <ConditionalFooter />
            <Suspense><PushClickTracker /></Suspense>
            <ServiceWorkerRegistration />
            <InstallPrompt />
            <AccessibilityWidget />
          </Providers>
        </GlobalErrorBoundary>
      </body>
    </html>
  );
}
