'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';
import UserAvatar from './UserAvatar';
import NotificationBell from './NotificationBell';
import {
  Tv, Calendar, Users, Newspaper, Building2, Menu, X,
  MessageCircle, Megaphone, Wrench, LogIn, LogOut, UserIcon,
  Palette, ChevronDown, Settings, CheckCircle, Clapperboard, Shield, UsersRound
} from 'lucide-react';
import { useGlobalUnread } from '@/hooks/useGlobalUnread';

const navLinks = [
  { href: '/', label: 'בית', icon: Tv },
  { href: '/schedule', label: 'שידורים', icon: Calendar },
  { href: '/productions', label: 'הפקות', icon: Clapperboard, auth: true },
  { href: '/teams', label: 'צוותים', icon: UsersRound, auth: true },
  { href: '/directory', label: 'אלפון', icon: Users, auth: true },
  { href: '/chat', label: 'צ\'אט', icon: MessageCircle, auth: true },
  { href: '/board', label: 'לוח מודעות', icon: Megaphone },
  { href: '/news', label: 'חדשות', icon: Newspaper },
  { href: '/studios', label: 'אולפנים', icon: Building2 },
  { href: '/tools', label: 'כלים', icon: Wrench },
  { href: '/admin', label: 'ניהול', icon: Shield, auth: true, adminOnly: true },
];

function emitNavigationStart() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('app:navigation-start'));
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, logout } = useAuth();
  const { theme, setTheme } = useTheme();
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

  const navigateFromNav = useCallback((href: string) => {
    emitNavigationStart();
    setMobileOpen(false);
    setUserMenuOpen(false);
    setThemeMenuOpen(false);
    router.push(href);
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem('tv-auth-profile-cache');
      if (!raw) {
        setCachedProfile(null);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'profile' in parsed) {
        const payload = parsed as { profile?: typeof profile };
        setCachedProfile(payload.profile ?? null);
      } else {
        setCachedProfile((parsed as typeof profile) ?? null);
      }
    } catch {
      setCachedProfile(null);
    }
  }, [pathname, profile]);

  // Show loading bar on route change
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setLoadingBar(true);
      const t = setTimeout(() => setLoadingBar(false), 600);
      return () => clearTimeout(t);
    }
  }, [pathname]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredLinks = navLinks.filter(link => {
    if (link.auth && !hasAuthUi) return false;
    if ('adminOnly' in link && link.adminOnly && effectiveProfile?.siteRole !== 'admin') return false;
    return true;
  });

  return (
    <nav className="fixed right-0 left-0 z-[9999] backdrop-blur-xl border-b transition-colors app-safe-x" style={{
      top: 'var(--safe-area-top)',
      background: 'var(--theme-nav-bg)',
      borderColor: 'var(--theme-border)',
      minHeight: 'var(--app-header-height)',
    }}>
      {/* Navigation loading bar */}
      {loadingBar && (
        <div className="absolute top-0 right-0 left-0 h-0.5 overflow-hidden z-50">
          <div
            className="h-full bg-gradient-to-l from-purple-500 to-blue-500"
            style={{ animation: 'navLoadBar 0.6s ease-out forwards' }}
          />
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigateFromNav('/');
            }}
            className="flex items-center gap-2 group min-w-0 shrink-0"
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0 group-hover:shadow-lg group-hover:shadow-purple-500/20 transition-all">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold leading-none whitespace-nowrap gradient-text hidden sm:block">
              TV Industry IL
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {filteredLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              const isChat = link.href === '/chat';
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={true}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateFromNav(link.href);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'text-[var(--theme-accent)]'
                      : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)]'
                  }`}
                  style={isActive ? {
                    background: 'var(--theme-accent-glow)',
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 20%, transparent)`,
                  } : undefined}
                >
                  <div className="relative">
                    <Icon className="w-4 h-4" />
                    {isChat && totalUnread > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {totalUnread > 99 ? '99+' : totalUnread}
                      </span>
                    )}
                  </div>
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            {user && <NotificationBell />}

            {/* Theme Toggle (desktop) */}
            <div className="relative hidden md:block" ref={themeMenuRef}>
              <button
                onClick={() => { setThemeMenuOpen(!themeMenuOpen); setUserMenuOpen(false); }}
                className="p-2 rounded-lg transition-all text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)]"
                title="ערכת נושא"
              >
                <Palette className="w-5 h-5" />
              </button>

              {themeMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-xl border p-2 shadow-xl z-[100]" style={{
                  background: 'var(--theme-bg-secondary)',
                  borderColor: 'var(--theme-border)',
                }}>
                  {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => { setTheme(key); setThemeMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                        theme === key
                          ? 'text-[var(--theme-accent)]'
                          : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)]'
                      }`}
                      style={theme === key ? { background: 'var(--theme-accent-glow)' } : undefined}
                    >
                      <span className="text-lg">{t.emoji}</span>
                      <span className="font-medium">{t.label}</span>
                      {theme === key && <CheckCircle className="w-4 h-4 mr-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* User Menu / Login */}
            {hasAuthUi ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => { setUserMenuOpen(!userMenuOpen); setThemeMenuOpen(false); }}
                  className="flex items-center gap-2 p-1.5 rounded-xl transition-all hover:bg-[var(--theme-accent-glow)]"
                >
                  <UserAvatar
                    name={effectiveProfile?.displayName || user?.displayName || user?.email || 'משתמש'}
                    photoURL={effectiveProfile?.photoURL || user?.photoURL || null}
                    size="sm"
                    isOnline={true}
                  />
                  <span className="hidden sm:block text-sm font-medium text-[var(--theme-text)] max-w-[100px] truncate">
                    {effectiveProfile?.displayName || user?.displayName || 'משתמש'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[var(--theme-text-secondary)] hidden sm:block transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && user && (
                  <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border shadow-xl z-[100]" style={{
                    background: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                  }}>
                    {/* User info header */}
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                      <p className="text-sm font-bold text-[var(--theme-text)]">
                        {effectiveProfile?.displayName || user.displayName || 'משתמש'}
                      </p>
                      <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                        {effectiveProfile?.email || user.email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs text-[var(--theme-text-secondary)]">
                          {effectiveProfile?.status === 'busy' ? 'תפוס' : 'פנוי'}
                        </span>
                      </div>
                    </div>

                    <div className="p-2">
                      <button
                        onClick={() => navigateFromNav('/profile')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-all"
                      >
                        <UserIcon className="w-4 h-4" />
                        <span className="font-medium">הפרופיל שלי</span>
                      </button>
                      <button
                        onClick={() => navigateFromNav('/settings')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-all"
                      >
                        <Settings className="w-4 h-4" />
                        <span className="font-medium">הגדרות</span>
                      </button>

                      <div className="my-1 border-t" style={{ borderColor: 'var(--theme-border)' }} />

                      <button
                        onClick={async () => {
                          setUserMenuOpen(false);
                          try {
                            if (typeof window !== 'undefined') {
                              localStorage.removeItem('lastOpenedChat');
                              localStorage.removeItem('lastScheduleWeek');
                              sessionStorage.clear();
                            }
                            await signOut(auth);
                            window.location.href = '/login';
                          } catch {
                            window.location.href = '/login';
                          }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="font-medium">התנתקות</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                onClick={(event) => {
                  event.preventDefault();
                  navigateFromNav('/login');
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all bg-gradient-to-l from-purple-500 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/20"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">כניסה</span>
              </Link>
            )}

            {/* Mobile Toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t backdrop-blur-xl" style={{
          borderColor: 'var(--theme-border)',
          background: 'var(--theme-nav-bg)',
        }}>
          <div className="px-4 py-3 space-y-1">
            {filteredLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              const isChat = link.href === '/chat';
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateFromNav(link.href);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'text-[var(--theme-accent)]'
                      : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)]'
                  }`}
                  style={isActive ? { background: 'var(--theme-accent-glow)' } : undefined}
                >
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {isChat && totalUnread > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {totalUnread > 99 ? '99+' : totalUnread}
                      </span>
                    )}
                  </div>
                  {link.label}
                </Link>
              );
            })}

            {/* Mobile Theme Selector */}
            <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
              <p className="px-4 py-1.5 text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" />
                ערכת נושא
              </p>
              <div className="flex flex-wrap gap-2 px-4 py-2">
                {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      theme === key
                        ? 'text-[var(--theme-accent)] ring-1'
                        : 'text-[var(--theme-text-secondary)]'
                    }`}
                    style={{
                      background: theme === key ? 'var(--theme-accent-glow)' : 'var(--theme-bg)',
                      ...(theme === key ? { ringColor: 'var(--theme-accent)' } : {}),
                    }}
                  >
                    <span>{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
