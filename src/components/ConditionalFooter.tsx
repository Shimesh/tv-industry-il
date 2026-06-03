'use client';

import { usePathname } from 'next/navigation';
import Footer from '@/components/Footer';

// Pages where the footer should be hidden (full-screen app-like layouts)
const NO_FOOTER_PATHS = ['/chat'];

export default function ConditionalFooter() {
  const pathname = usePathname();
  if (NO_FOOTER_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }
  return <Footer />;
}
