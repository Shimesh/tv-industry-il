import Link from 'next/link';
import { Heart, Tv } from 'lucide-react';
import BugReportButton from '@/components/BugReportButton';

const footerLinks = [
  { href: '/', label: 'דף הבית' },
  { href: '/schedule', label: 'שידור חי' },
  { href: '/directory', label: 'אלפון מקצועי' },
  { href: '/chat', label: "צ'אט" },
  { href: '/board', label: 'לוח מודעות' },
  { href: '/news', label: 'חדשות' },
  { href: '/ratings', label: 'רייטינג' },
  { href: '/studios', label: 'אולפנים' },
  { href: '/tools', label: 'כלים' },
  { href: '/world-cup', label: 'מונדיאל 2026' },
  { href: '/productions', label: 'הפקות' },
  { href: '/teams', label: 'צוותים' },
];

const legalLinks = [
  { href: '/terms', label: 'תקנון' },
  { href: '/privacy', label: 'פרטיות' },
  { href: '/accessibility', label: 'נגישות' },
];

export default function Footer() {
  return (
    <footer
      className="relative mt-6 overflow-hidden app-safe-bottom"
      style={{ background: 'var(--theme-bg-secondary)', borderTop: '1px solid var(--theme-border)' }}
      dir="rtl"
    >
      {/* Colorful top accent line */}
      <div className="h-[2px] bg-gradient-to-l from-purple-500 via-fuchsia-500 via-blue-500 to-sky-400 opacity-75" />

      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_110%,rgba(168,85,247,0.07),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">

        {/* Main section */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">

          {/* Brand */}
          <div className="flex flex-col gap-3 lg:max-w-[300px]">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-500"
                style={{ boxShadow: '0 0 22px rgba(168,85,247,0.38), inset 0 1px 0 rgba(255,255,255,0.15)' }}
              >
                <Tv className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-base font-black gradient-text leading-tight" dir="ltr">TV Industry IL</div>
                <div className="text-[11px] font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                  פלטפורמת תעשיית הטלוויזיה הישראלית
                </div>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
              אלפון מקצועי, שידורים חיים, חדשות, יומן אישי, לוח מודעות, כלי הפקה ועוד — הכל במקום אחד לאנשי תעשיית הטלוויזיה בישראל.
            </p>
          </div>

          {/* Navigation grid */}
          <nav className="grid grid-cols-3 gap-x-6 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-3">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium transition-colors hover:text-[var(--theme-accent)]"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Divider */}
        <div
          className="my-6 h-px"
          style={{ background: 'linear-gradient(to left, var(--theme-border), color-mix(in srgb, var(--theme-border) 30%, transparent))' }}
        />

        {/* Bottom bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              <span dir="ltr">© 2026 TV Industry IL</span>
              <Heart className="h-3 w-3 fill-red-400 text-red-400" />
              נבנה עם אהבה לתעשייה
            </p>
            <BugReportButton />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-[var(--theme-accent)]"
              >
                {link.label}
              </Link>
            ))}
            <span
              className="rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold"
              style={{
                borderColor: 'color-mix(in srgb, var(--theme-border) 120%, transparent)',
                color: 'var(--theme-accent)',
                background: 'color-mix(in srgb, var(--theme-accent) 8%, transparent)',
              }}
              dir="ltr"
            >


              v2.8.67

</span>
            <span className="opacity-45" dir="ltr">By Yaron Orbach</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
