'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Tv, Mail, Lock, User, Briefcase, Eye, EyeOff, ArrowLeft, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const departments = [
  { value: 'צילום', label: 'צילום' },
  { value: 'טכני', label: 'טכני' },
  { value: 'הפקה', label: 'הפקה' },
  { value: 'סאונד', label: 'סאונד' },
  { value: 'תאורה', label: 'תאורה' },
];

const roles = ['צלם', 'צלם רחף', 'כתוביות', 'ניהול במה', 'פיקוח קול', 'VTR', 'תפאורן', 'ניתוב', 'CCU', 'טלפרומפטר', 'תאורן', 'קול', 'עורך', 'מנהל הפקה', 'מפיק', 'במאי'];

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { user, loading: authLoading, signIn, signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  // Redirect to home if already logged in (handles redirect flow from Google)
  useEffect(() => {
    if (user && !authLoading) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      setError('Firebase לא מוגדר. יש להגדיר קובץ .env.local עם פרטי Firebase אמיתיים. ראה .env.local.example');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        if (!name || !department || !role) {
          setError('יש למלא את כל השדות');
          setIsLoading(false);
          return;
        }
        await signUp(email, password, name, department, role);
      }
      router.push('/');
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password') {
        setError('אימייל או סיסמה שגויים');
      } else if (firebaseError.code === 'auth/email-already-in-use') {
        setError('אימייל זה כבר רשום במערכת');
      } else if (firebaseError.code === 'auth/weak-password') {
        setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      } else {
        setError('שגיאה בהתחברות. נסו שוב.');
      }
    }
    setIsLoading(false);
  };

  // Check if Firebase is configured with real credentials
  const isFirebaseConfigured = process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== 'demo-api-key';

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured) {
      setError('Firebase לא מוגדר. יש להגדיר קובץ .env.local עם פרטי Firebase אמיתיים. ראה .env.local.example');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      // This redirects the page to Google - won't return here
      await signInWithGoogle();
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string };
      if (firebaseError.code === 'auth/unauthorized-domain') {
        setError('הדומיין הנוכחי לא מורשה ב-Firebase. יש להוסיף אותו בהגדרות Firebase → Authentication → Authorized domains');
      } else if (firebaseError.code === 'auth/configuration-not-found' || firebaseError.code === 'auth/invalid-api-key') {
        setError('Firebase לא מוגדר כראוי. יש להגדיר קובץ .env.local עם פרטי Firebase אמיתיים');
      } else {
        setError(`שגיאה בהתחברות: ${firebaseError.code || firebaseError.message || 'שגיאה לא ידועה'}`);
      }
      setIsLoading(false);
    }
    // Don't setIsLoading(false) on success - page is redirecting to Google
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
            className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30"
          >
            <Tv className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-black gradient-text mb-2">TV Industry IL</h1>
          <p className="text-[var(--theme-text-secondary)] text-sm">
            {mode === 'login' ? 'ברוכים השבים! היכנסו לחשבון שלכם' : 'הצטרפו לקהילת אנשי הטלוויזיה'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
          {/* Mode Toggle */}
          <div className="flex bg-[var(--theme-bg)] rounded-xl p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                mode === 'login'
                  ? 'bg-gradient-to-l from-purple-500 to-blue-600 text-white shadow-lg'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
              }`}
            >
              כניסה
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                mode === 'register'
                  ? 'bg-gradient-to-l from-purple-500 to-blue-600 text-white shadow-lg'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
              }`}
            >
              הרשמה
            </button>
          </div>

          {/* Firebase not configured warning */}
          {!isFirebaseConfigured && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
              <strong>⚠️ Firebase לא מוגדר</strong><br />
              כדי להפעיל את מערכת ההתחברות, יש ליצור פרויקט ב-<a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-200">Firebase Console</a>, להפעיל Authentication עם Google, ולהגדיר את הפרטים בקובץ <code className="bg-amber-500/20 px-1 rounded">.env.local</code>
            </div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4"
                >
                  {/* Name */}
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
                    <input
                      type="text"
                      placeholder="שם מלא"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pr-11 pl-4 py-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)] outline-none transition-all text-sm"
                    />
                  </div>

                  {/* Department & Role */}
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="py-3 px-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)] transition-all"
                    >
                      <option value="">מחלקה</option>
                      {departments.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="py-3 px-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)] transition-all"
                    >
                      <option value="">תפקיד</option>
                      {roles.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
              <input
                type="email"
                placeholder="אימייל"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pr-11 pl-4 py-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)] outline-none transition-all text-sm"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="סיסמה"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pr-11 pl-11 py-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)] outline-none transition-all text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'כניסה' : 'הרשמה'}
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-5">
            <div className="flex-1 h-px bg-[var(--theme-border)]" />
            <span className="text-[var(--theme-text-secondary)] text-xs">או</span>
            <div className="flex-1 h-px bg-[var(--theme-border)]" />
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text)] font-medium hover:bg-[var(--theme-accent-glow)] transition-all disabled:opacity-50 flex items-center justify-center gap-3 text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            כניסה עם Google
          </button>

          {/* Feature highlights */}
          <div className="mt-6 pt-5 border-t border-[var(--theme-border)]">
            <div className="flex items-center gap-2 text-[var(--theme-text-secondary)] text-xs mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              מה מחכה לכם בפנים:
            </div>
            <div className="flex flex-wrap gap-2">
              {['צ\'אט קבוצתי', 'שיחות וידאו', 'לוח מודעות', 'כלי הפקה', 'לוח שידורים'].map(f => (
                <span key={f} className="px-2.5 py-1 rounded-full bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-xs font-medium">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
