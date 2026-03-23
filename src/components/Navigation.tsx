'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';
import UserAvatar from './UserAvatar';
import NotificationBell from './NotificationBell';
import {
  Tv, Calendar, Users, Newspaper, Building2, Menu, X,
  MessageCircle, Megaphone, Wrench, LogIn, LogOut, UserIcon,
  Palette, ChevronDown, Settings, CheckCircle, Clapperboard
} from 'lucide-react';

const navLinks = [
  { href: '/', label: 'בית', icon: Tv },
  { href: '/schedule', label: 'שידורים', icon: Calendar },
  { href: '/productions', label: 'הפקות', icon: Clapperboard, auth: true },
  { href: '/directory', label: 'אלפון', icon: Users },
  { href: '/chat', label: 'צ\'אט', icon: MessageCircle, auth: true },
  { href: '/board', label: 'לוח מודעות', icon: Megaphone },
  { href: '/news', label: 'חדשות', icon: Newspaper },
  { href: '/studios', label: 'אולפנים', icon: Building2 },
  { href: '/tools', label: 'כלים', icon: Wrench },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

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

  const filteredLinks = navLinks.filter(link => !link.auth || user);

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 backdrop-blur-xl border-b transition-colors" style={{
      background: 'var(--theme-nav-bg)',
      borderColor: 'var(--theme-border)',
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center group-hover:shadow-lg group-hover:shadow-purple-500/20 transition-all">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold gradient-text hidden sm:block">
              TV Industry IL
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {filteredLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={true}
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
                  <Icon className="w-4 h-4" />
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
            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => { setUserMenuOpen(!userMenuOpen); setThemeMenuOpen(false); }}
                  className="flex items-center gap-2 p-1.5 rounded-xl transition-all hover:bg-[var(--theme-accent-glow)]"
                >
                  <UserAvatar
                    name={profile?.displayName || user.displayName || user.email || 'משתמש'}
                    photoURL={profile?.photoURL || user.photoURL}
                    size="sm"
                    isOnline={true}
                  />
                  <span className="hidden sm:block text-sm font-medium text-[var(--theme-text)] max-w-[100px] truncate">
                    {profile?.displayName || user.displayName || 'משתמש'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[var(--theme-text-secondary)] hidden sm:block transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border shadow-xl z-[100]" style={{
                    background: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                  }}>
                    {/* User info header */}
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                      <p className="text-sm font-bold text-[var(--theme-text)]">
                        {profile?.displayName || user.displayName || 'משתמש'}
                      </p>
                      <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                        {profile?.email || user.email}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs text-[var(--theme-text-secondary)]">
                          {profile?.status === 'busy' ? 'תפוס' : 'פנוי'}
                        </span>
                      </div>
                    </div>

                    <div className="p-2">
                      <button
                        onClick={() => { setUserMenuOpen(false); router.push('/profile'); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-all"
                      >
                        <UserIcon className="w-4 h-4" />
                        <span className="font-medium">הפרופיל שלי</span>
                      </button>
                      <button
                        onClick={() => { setUserMenuOpen(false); router.push('/settings'); }}
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
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'text-[var(--theme-accent)]'
                      : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)]'
                  }`}
                  style={isActive ? { background: 'var(--theme-accent-glow)' } : undefined}
                >
                  <Icon className="w-5 h-5" />
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
