import Link from 'next/link';
import { Tv, Heart, MessageCircle, Megaphone, Wrench } from 'lucide-react';

const footerLinks = [
  { href: '/', label: 'דף הבית' },
  { href: '/schedule', label: 'לוח שידורים' },
  { href: '/directory', label: 'אלפון מקצועי' },
  { href: '/chat', label: 'צ\'אט' },
  { href: '/board', label: 'לוח מודעות' },
  { href: '/news', label: 'חדשות ואירועים' },
  { href: '/studios', label: 'אולפנים' },
  { href: '/tools', label: 'ארגז כלים' },
];

export default function Footer() {
  return (
    <footer className="border-t transition-colors app-safe-bottom" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Tv className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold gradient-text">TV Industry IL</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
              הפלטפורמה המובילה לעובדי תעשיית הטלוויזיה הישראלית.
              כל המידע, אנשי הקשר, הצ&apos;אט והחדשות במקום אחד.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: 'var(--theme-text)' }}>ניווט מהיר</h3>
            <ul className="space-y-2">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:text-[var(--theme-accent)]"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: 'var(--theme-text)' }}>אודות</h3>
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--theme-text-secondary)' }}>
              TV Industry IL היא פלטפורמה שנבנתה עבור אנשי מקצוע בתעשיית הטלוויזיה הישראלית.
              צ&apos;אט, לוח מודעות, כלים מקצועיים ועוד.
            </p>
            <p className="text-xs" style={{ color: 'var(--theme-text-secondary)', opacity: 0.6 }}>
              המידע באתר מעודכן באופן שוטף ונועד לשימוש מקצועי בלבד.
            </p>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: '1px solid var(--theme-border)' }}>
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--theme-text-secondary)' }}>
            © 2026 TV Industry IL. כל הזכויות שמורות. נבנה עם
            <Heart className="w-3 h-3 text-red-400" />
            לתעשיית הטלוויזיה
          </p>
            <div className="text-xs text-center sm:text-left" style={{ color: 'var(--theme-text-secondary)', opacity: 0.55 }}>
              <p>Version 1.0.0</p>
              <p>By Yaron Orbach</p>
            </div>
        </div>
      </div>
    </footer>
  );
}
