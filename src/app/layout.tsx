import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { InstallPrompt } from "@/components/InstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import ScrollToTop from "@/components/ScrollToTop";

export const metadata: Metadata = {
  title: "TV Industry IL - פלטפורמת תעשיית הטלוויזיה הישראלית",
  description: "הפלטפורמה המובילה לעובדי תעשיית הטלוויזיה בישראל - לוח שידורים, אלפון מקצועי, חדשות ואירועים, אולפנים ועוד",
  keywords: "טלוויזיה, ישראל, הפקה, שידורים, אלפון, תעשייה",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TV Industry IL",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
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
      </head>
      <body className="antialiased min-h-screen flex flex-col app-safe-x app-safe-bottom" style={{ background: 'var(--theme-bg, #030712)', color: 'var(--theme-text, #f3f4f6)' }}>
        <Providers>
          <ScrollToTop />
          <Navigation />
          <main className="flex-1" style={{ paddingTop: 'var(--app-header-offset)', paddingBottom: 'var(--safe-area-bottom)' }}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <Footer />
          <ServiceWorkerRegistration />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
