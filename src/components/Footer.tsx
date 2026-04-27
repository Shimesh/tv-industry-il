import Link from 'next/link';
import { Heart, Tv } from 'lucide-react';
import BugReportButton from '@/components/BugReportButton';

const footerLinks = [
  { href: '/', label: 'דף הבית' },
  { href: '/schedule', label: 'שידור חי' },
  { href: '/directory', label: 'אלפון מקצועי' },
  { href: '/chat', label: 'צ׳אט' },
  { href: '/board', label: 'לוח מודעות' },
  { href: '/news', label: 'חדשות' },
  { href: '/studios', label: 'אולפנים' },
  { href: '/tools', label: 'כלים' },
];

export default function Footer() {
  return (
    <footer
      className="border-t transition-colors app-safe-bottom"
      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
              <Tv className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold gradient-text">TV Industry IL</div>
              <p className="text-[11px] leading-snug" style={{ color: 'var(--theme-text-secondary)' }}>
                קהילה, אלפון, שידור חי, חדשות וכלי עבודה במקום אחד.
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs transition-colors hover:text-[var(--theme-accent)]"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div
          className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTop: '1px solid var(--theme-border)' }}
        >
          <div className="flex items-center gap-3">
            <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
              © 2026 TV Industry IL
              <Heart className="h-3 w-3 text-red-400" />
              לתעשיית הטלוויזיה
            </p>
            <BugReportButton />
          </div>
          <div className="text-[11px] sm:text-left" style={{ color: 'var(--theme-text-secondary)', opacity: 0.8 }}>
            Version 1.0.1 · By Yaron Orbach
          </div>
        </div>
      </div>
    </footer>
  );
}
