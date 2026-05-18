'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';
import { useWorldCup } from '@/contexts/WorldCupContext';
import { useGlobalUnread } from '@/hooks/useGlobalUnread';
import UserAvatar from './UserAvatar';
import NotificationBell from './NotificationBell';
import {
  BarChart3,
  CheckCircle,
  ChevronDown,
  Clapperboard,
  LogIn,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Newspaper,
  Palette,
  Settings,
  Shield,
  Trophy,
  Tv,
  UserIcon,
  Users,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';

type NavLink = {
  href: string;
  label: string;
  icon: typeof Tv;
  auth?: boolean;
};

const navLinks: NavLink[] = [
  { href: '/', label: 'בית', icon: Tv },
  { href: '/productions', label: 'יומן אישי', icon: Clapperboard, auth: true },
  { href: '/teams', label: 'צוותים', icon: UsersRound, auth: true },
  { href: '/directory', label: 'אלפון', icon: Users, auth: true },
  { href: '/chat', label: "צ'אט", icon: MessageCircle, auth: true },
  { href: '/board', label: 'לוח מודעות', icon: Megaphone },
  { href: '/news', label: 'חדשות', icon: Newspaper },
  { href: '/ratings', label: 'רייטינג', icon: BarChart3 },
  { href: '/tools', label: 'כלים', icon: Wrench },
  { href: '/world-cup', label: 'מונדיאל', icon: Trophy },
];

const adminNavLink: NavLink = { href: '/admin', label: 'ניהול', icon: Shield, auth: true };

function emitNavigationStart() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('app:navigation-start'));
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isWorldCupMode } = useWorldCup();
  const totalUnread = useGlobalUnread();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [loadingBar, setLoadingBar] = useState(false);
  const [cachedProfile, setCachedProfile] = useState<typeof profile>(null);
  const prevPathnameRef = useRef(pathname);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const effectiveProfile = profile ?? (loading ? cachedProfile : null);
  const hasAuthUi = Boolean(user || (loading && cachedProfile));
  const showAdminLink = hasAuthUi && effectiveProfile?.siteRole === 'admin';
  const adminIsActive = pathname === '/admin' || pathname.startsWith('/admin/');

  const navigateFromNav = useCallback((href: string) => {
    emitNavigationStart();
    setMobileOpen(false);
    setUserMenuOpen(false);
    setThemeMenuOpen(false);
    if (href === '/' && pathname === '/' && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (pathname === '/chat' && typeof window !== 'undefined') {
      window.location.href = href;
      return;
    }
    router.push(href);
  }, [pathname, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let nextProfile: typeof profile = null;
    try {
      const raw = window.sessionStorage.getItem('tv-auth-profile-cache');
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        nextProfile = parsed && typeof parsed === 'object' && 'profile' in parsed
          ? (parsed as { profile?: typeof profile }).profile ?? null
          : (parsed as typeof profile) ?? null;
      }
    } catch {
      nextProfile = null;
    }
    const timer = window.setTimeout(() => setCachedProfile(nextProfile), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, profile]);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      const startTimer = window.setTimeout(() => setLoadingBar(true), 0);
      const timer = window.setTimeout(() => setLoadingBar(false), 600);
      return () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(timer);
      };
    }
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) setThemeMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredLinks = navLinks.filter((link) => !link.auth || hasAuthUi);

  const renderNavLink = (link: NavLink, compact = false) => {
    const isActive = pathname === link.href;
    const Icon = link.icon;
    const isChat = link.href === '/chat';
    return (
      <Link
        key={link.href}
        href={link.href}
        prefetch
        onClick={(event) => {
          event.preventDefault();
          navigateFromNav(link.href);
        }}
        className={`${compact ? 'flex px-4 py-3 text-sm' : 'inline-flex h-10 px-2 text-xs 2xl:px-3 2xl:text-sm'} items-center gap-1.5 rounded-xl font-bold leading-none transition-all ${
          isActive
            ? 'text-[var(--theme-accent)]'
            : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]'
        }`}
        style={isActive ? {
          background: 'linear-gradient(135deg, var(--theme-accent-glow), color-mix(in srgb, var(--theme-bg-card) 72%, transparent))',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 28%, transparent)',
        } : undefined}
      >
        <span className="relative">
          <Icon className={compact ? 'h-5 w-5' : 'h-4 w-4'} />
          {isChat && totalUnread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-[3px] text-[9px] font-bold leading-none text-white">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          ) : null}
        </span>
        {link.label}
      </Link>
    );
  };

  const renderAdminLink = (compact = false) => (
    <Link
      href={adminNavLink.href}
      prefetch
      onClick={(event) => {
        event.preventDefault();
        navigateFromNav(adminNavLink.href);
      }}
      className={`${compact ? 'flex px-4 py-3 text-sm' : 'inline-flex h-10 px-2 text-xs 2xl:px-3 2xl:text-sm'} items-center gap-1.5 rounded-xl border font-bold leading-none transition-all ${
        adminIsActive
          ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300'
          : 'border-yellow-400/20 text-yellow-200/80 hover:bg-yellow-400/10 hover:text-yellow-100'
      }`}
    >
      <Shield className={compact ? 'h-5 w-5' : 'h-4 w-4'} />
      {adminNavLink.label}
    </Link>
  );

  return (
    <nav
      className="fixed left-0 right-0 top-0 z-[9999] border-b transition-colors app-safe-x app-nav-shell"
      style={{
        background: 'var(--theme-nav-bg)',
        borderColor: isWorldCupMode ? 'var(--wc-gold)' : 'var(--theme-border)',
        boxShadow: isWorldCupMode ? '0 0 34px var(--wc-gold-glow), inset 0 -1px 0 var(--wc-gold)' : undefined,
        minHeight: 'var(--app-header-offset)',
        paddingTop: 'var(--safe-area-top)',
      }}
    >
      {loadingBar ? (
        <div className="absolute left-0 right-0 top-0 z-50 h-0.5 overflow-hidden">
          <div className="h-full bg-gradient-to-l from-purple-500 via-pink-500 to-teal-400" style={{ animation: 'navLoadBar 0.6s ease-out forwards' }} />
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigateFromNav('/');
            }}
            className="group flex min-w-0 shrink-0 items-center gap-2"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-teal-400 shadow-lg shadow-purple-500/20 transition-all group-hover:shadow-purple-500/35">
              <Tv className="h-5 w-5 text-white" />
            </div>
            <span className="hidden whitespace-nowrap text-lg font-black leading-none gradient-text 2xl:block">TV Industry IL</span>
          </Link>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 xl:flex">
            {filteredLinks.map((link) => renderNavLink(link))}
            {showAdminLink ? (
              <>
                <span className="mx-1 h-7 w-px shrink-0 bg-[var(--theme-border)]" />
                {renderAdminLink()}
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {user ? <NotificationBell /> : null}

            <div className="relative hidden md:block" ref={themeMenuRef}>
              <button
                onClick={() => {
                  setThemeMenuOpen(!themeMenuOpen);
                  setUserMenuOpen(false);
                }}
                className="rounded-xl p-2 text-[var(--theme-text-secondary)] transition-all hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]"
                title="ערכת נושא"
              >
                <Palette className="h-5 w-5" />
              </button>

              {themeMenuOpen ? (
                <div className="app-panel absolute left-0 top-full z-[100] mt-2 w-52 p-2 shadow-2xl">
                  {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, themeOption]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTheme(key);
                        setThemeMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all ${
                        theme === key
                          ? 'text-[var(--theme-accent)]'
                          : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]'
                      }`}
                      style={theme === key ? { background: 'var(--theme-accent-glow)' } : undefined}
                    >
                      <span className="text-lg">{themeOption.emoji}</span>
                      <span className="font-bold">{themeOption.label}</span>
                      {theme === key ? <CheckCircle className="mr-auto h-4 w-4" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {hasAuthUi ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => {
                    setUserMenuOpen(!userMenuOpen);
                    setThemeMenuOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-xl p-1.5 transition-all hover:bg-[var(--theme-accent-glow)]"
                >
                  <UserAvatar
                    name={effectiveProfile?.displayName || user?.displayName || user?.email || 'משתמש'}
                    photoURL={effectiveProfile?.photoURL || user?.photoURL || null}
                    size="sm"
                    isOnline={effectiveProfile?.isOnline !== false}
                  />
                  <span className="hidden max-w-[100px] truncate text-sm font-bold text-[var(--theme-text)] 2xl:block">
                    {effectiveProfile?.displayName || user?.displayName || 'משתמש'}
                  </span>
                  <ChevronDown className={`hidden h-4 w-4 text-[var(--theme-text-secondary)] transition-transform 2xl:block ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && user ? (
                  <div className="app-panel absolute left-0 top-full z-[100] mt-2 w-60 overflow-hidden shadow-2xl">
                    <div className="border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
                      <p className="text-sm font-black text-[var(--theme-text)]">{effectiveProfile?.displayName || user.displayName || 'משתמש'}</p>
                      <p className="truncate text-xs text-[var(--theme-text-secondary)]" dir="ltr">{effectiveProfile?.email || user.email}</p>
                    </div>
                    <div className="p-2">
                      <button onClick={() => navigateFromNav('/profile')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--theme-text-secondary)] transition-all hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]">
                        <UserIcon className="h-4 w-4" />
                        <span className="font-bold">הפרופיל שלי</span>
                      </button>
                      <button onClick={() => navigateFromNav('/settings')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--theme-text-secondary)] transition-all hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]">
                        <Settings className="h-4 w-4" />
                        <span className="font-bold">הגדרות</span>
                      </button>
                      <div className="my-1 border-t" style={{ borderColor: 'var(--theme-border)' }} />
                      <button
                        onClick={async () => {
                          setUserMenuOpen(false);
                          try {
                            localStorage.removeItem('lastOpenedChat');
                            localStorage.removeItem('lastScheduleWeek');
                            sessionStorage.clear();
                            await signOut(auth);
                            window.location.href = '/login';
                          } catch {
                            window.location.href = '/login';
                          }
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 transition-all hover:bg-red-500/10"
                      >
                        <LogOut className="h-4 w-4" />
                        <span className="font-bold">התנתקות</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                href="/login"
                onClick={(event) => {
                  event.preventDefault();
                  navigateFromNav('/login');
                }}
                aria-label="הרשמה או כניסה לאפליקציה"
                className="flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-purple-500 via-fuchsia-500 to-blue-600 px-3 py-2 text-sm font-black text-white shadow-lg shadow-purple-500/20 transition-all hover:shadow-purple-500/35 sm:px-4"
              >
                <LogIn className="h-4 w-4" />
                <span className="whitespace-nowrap">הרשמה / כניסה</span>
              </Link>
            )}

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-xl p-2 text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] xl:hidden"
              aria-label="פתיחת תפריט"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t backdrop-blur-xl xl:hidden" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-nav-bg)' }}>
          <div className="space-y-1 px-4 py-3">
            {filteredLinks.map((link) => renderNavLink(link, true))}

            {showAdminLink ? (
              <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--theme-border)' }}>
                {renderAdminLink(true)}
              </div>
            ) : null}

            <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--theme-border)' }}>
              <p className="flex items-center gap-2 px-4 py-1.5 text-xs font-black text-[var(--theme-text-secondary)]">
                <Palette className="h-3.5 w-3.5" />
                ערכת נושא
              </p>
              <div className="flex flex-wrap gap-2 px-4 py-2">
                {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, themeOption]) => (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      theme === key ? 'text-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'
                    }`}
                    style={{ background: theme === key ? 'var(--theme-accent-glow)' : 'var(--theme-bg)' }}
                  >
                    <span>{themeOption.emoji}</span>
                    {themeOption.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
