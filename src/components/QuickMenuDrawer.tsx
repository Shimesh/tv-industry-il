'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Home,
  Megaphone,
  MessageCircle,
  Radio,
  Settings,
  Shield,
  Trophy,
  UserRound,
  UserRoundCog,
  Wrench,
  X,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';

const mainLinks = [
  { href: '/', label: 'דף הבית', icon: Home, accent: '#a78bfa' },
  { href: '/calendar', label: 'יומן אישי', icon: CalendarDays, accent: '#60a5fa', auth: true },
  { href: '/directory', label: 'אלפון', icon: UserRoundCog, accent: '#f59e0b', auth: true },
  { href: '/live', label: 'שידור חי', icon: Radio, accent: '#ef4444' },
  { href: '/studios', label: 'אולפנים', icon: Building2, accent: '#f97316' },
  { href: '/board', label: 'לוח מודעות', icon: Megaphone, accent: '#38bdf8' },
  { href: '/chat', label: "צ'אט", icon: MessageCircle, accent: '#ec4899', auth: true },
  { href: '/ratings', label: 'רייטינג', icon: BarChart3, accent: '#c084fc' },
  { href: '/toolbox', label: 'כלים', icon: Wrench, accent: '#14b8a6' },
  { href: '/world-cup', label: 'מונדיאל', icon: Trophy, accent: '#D4AF37' },
] as const;

const bottomLinks = [
  { href: '/profile', label: 'פרופיל אישי', icon: UserRound, accent: '#8b5cf6', auth: true },
  { href: '/settings', label: 'הגדרות', icon: Settings, accent: '#f97316', auth: true },
] as const;

const adminLink = { href: '/admin', label: 'ניהול', icon: Shield, accent: '#facc15' } as const;

type QuickMenuDrawerProps = {
  open: boolean;
  onClose: () => void;
};

type QuickMenuLink = (typeof mainLinks)[number] | (typeof bottomLinks)[number] | typeof adminLink;

export default function QuickMenuDrawer({ open, onClose }: QuickMenuDrawerProps) {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const isAdmin = profile?.siteRole === 'admin';
  const hasAuth = Boolean(user);
  const visibleMainLinks = mainLinks.filter((link) => !('auth' in link) || !link.auth || hasAuth);
  const visibleBottomLinks = bottomLinks.filter((link) => !link.auth || hasAuth);

  const renderLink = (link: QuickMenuLink, index: number, compact = false, admin = false) => {
    const Icon = link.icon;
    const isActive =
      pathname === link.href ||
      (link.href === '/toolbox' && pathname === '/tools') ||
      (link.href === '/calendar' && pathname === '/productions') ||
      (link.href === '/admin' && pathname.startsWith('/admin/'));

    const handleNavigate = (event: MouseEvent<HTMLAnchorElement>) => {
      onClose();
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new Event('app:navigation-start'));
      if (pathname === '/chat' && link.href !== pathname) {
        event.preventDefault();
        window.location.href = link.href;
      }
    };

    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={handleNavigate}
        className={`group relative isolate flex min-h-[52px] items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2 text-right shadow-lg shadow-black/15 transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.12] active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
          isActive ? 'border-white/25 bg-white/[0.13]' : admin ? 'border-yellow-300/20 bg-yellow-300/[0.08]' : 'border-white/10 bg-white/[0.07]'
        }`}
        style={{ animation: open ? `fadeIn 260ms ease-out ${index * 38}ms both` : undefined }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-0 blur-xl transition duration-200 group-hover:opacity-35 group-focus-visible:opacity-35"
          style={{ background: `radial-gradient(circle at 86% 18%, ${link.accent}77, transparent 42%)` }}
        />
        {isActive ? (
          <div className="pointer-events-none absolute inset-y-3 right-0 w-px" style={{ background: `linear-gradient(180deg, transparent, ${link.accent}, transparent)` }} />
        ) : null}

        <span
          className={`relative flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 transition duration-200 group-hover:scale-105 ${
            compact ? 'h-9 w-9' : 'h-10 w-10'
          }`}
          style={{ color: link.accent }}
        >
          <Icon className={compact ? 'h-[18px] w-[18px]' : 'h-5 w-5'} strokeWidth={1.5} />
        </span>
        <span className="relative min-w-0 text-sm font-black leading-tight text-white">{link.label}</span>
      </Link>
    );
  };

  return (
    <div data-quick-drawer-root="true" className={`fixed inset-0 z-[9999] h-screen transition ${open ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button
        type="button"
        aria-label="סגירת תפריט מהיר"
        onClick={onClose}
        className={`fixed inset-0 h-screen bg-black/55 backdrop-blur-md transition-opacity duration-300 ease-in-out ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      <aside
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label="תפריט מהיר"
        className={`fixed right-0 top-0 z-[9999] h-screen w-[min(390px,calc(100vw-1.5rem))] overflow-hidden rounded-l-[1.75rem] border border-white/15 bg-slate-950/80 shadow-2xl shadow-black/45 backdrop-blur-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_12%,rgba(56,189,248,0.22),transparent_32%),radial-gradient(circle_at_18%_82%,rgba(224,122,95,0.20),transparent_38%)]" />

        <div className="relative flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-wide text-white/45">Quick Menu</p>
              <h2 className="text-base font-black text-white">מרכז ניווט מהיר</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white/75 transition hover:bg-white/15 hover:text-white active:scale-[0.95]"
              aria-label="סגירת תפריט מהיר"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
            <div className="grid grid-cols-1 gap-2">
              {visibleMainLinks.map((link, index) => renderLink(link, index))}
            </div>

            <div className="flex-grow" />

            {visibleBottomLinks.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-white/10 pt-3">
                {visibleBottomLinks.map((link, index) => renderLink(link, visibleMainLinks.length + index, true))}
              </div>
            ) : null}

            {isAdmin ? (
              <div className="mt-3 border-t border-yellow-300/20 pt-3">
                {renderLink(adminLink, visibleMainLinks.length + visibleBottomLinks.length, true, true)}
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
