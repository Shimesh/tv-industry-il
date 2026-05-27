'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Tv, Mail, Lock, User, Eye, EyeOff, ArrowLeft, Sparkles, Phone, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { INDUSTRY_DEPARTMENTS, INDUSTRY_ROLE_OPTIONS, getRolesForDepartment } from '@/constants/departments';

function formatIsraeliPhoneForFirebase(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, '');

  if (/^\+9725\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  const digits = cleaned.replace(/\D/g, '');

  if (/^05\d{8}$/.test(digits)) {
    return `+972${digits.slice(1)}`;
  }

  if (/^9725\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

function isHebrewName(value: string): boolean {
  return value.trim().length >= 2 && /[א-ת]/.test(value);
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [googleNameStep, setGoogleNameStep] = useState(false);
  const [googleHebrewName, setGoogleHebrewName] = useState('');
  const [googleNameError, setGoogleNameError] = useState('');
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const { user, loading: authLoading, signIn, signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  // Redirect to home if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!pendingRedirect) return;
    router.push(pendingRedirect);
  }, [pendingRedirect, router]);

  const resetRecaptchaVerifier = useCallback(() => {
    try {
      recaptchaVerifierRef.current?.clear();
    } catch {}
    recaptchaVerifierRef.current = null;

    if (typeof document !== 'undefined') {
      document.getElementById('recaptcha-container')?.replaceChildren();
    }
  }, []);

  useEffect(() => {
    return () => resetRecaptchaVerifier();
  }, [resetRecaptchaVerifier]);

  const getRecaptchaVerifier = () => {
    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current;
    }

    if (typeof document === 'undefined' || !document.getElementById('recaptcha-container')) {
      throw new Error('recaptcha-container-missing');
    }

    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });

    return recaptchaVerifierRef.current;
  };

  const validateName = (value: string): string => {
    if (!value.trim()) return 'יש להזין שם מלא';
    if (!isHebrewName(value)) return 'יש להזין שם בעברית (לפחות 2 תווים עם אותיות עבריות)';
    return '';
  };

  const validateRegisterPhone = (value: string): string => {
    if (!value.trim()) return 'יש להזין מספר טלפון';
    if (!formatIsraeliPhoneForFirebase(value)) return 'מספר טלפון ישראלי לא תקין, לדוגמה 050-0000000';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      setError('Firebase לא מוגדר. יש להגדיר קובץ .env.local עם פרטי Firebase אמיתיים. ראה .env.local.example');
      return;
    }
    setError('');

    if (mode === 'register') {
      const nErr = validateName(name);
      const pErr = validateRegisterPhone(registerPhone);
      if (nErr) { setNameError(nErr); return; }
      if (pErr) { setPhoneError(pErr); return; }
      if (!acceptedTerms) {
        setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להירשם');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
        setPendingRedirect('/');
      } else {
        await signUp(email, password, name, registerPhone, department, role);
        setRegistrationSuccess(true);
      }
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
  const isRegisterSubmitDisabled = isLoading || (mode === 'register' && !acceptedTerms);
  const roleOptions = department
    ? Array.from(new Set([...getRolesForDepartment(department), role].filter(Boolean)))
    : INDUSTRY_ROLE_OPTIONS;

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured) {
      setError('Firebase לא מוגדר. יש להגדיר קובץ .env.local עם פרטי Firebase אמיתיים. ראה .env.local.example');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // Check if the Google display name is Hebrew
      const { auth: firebaseAuth } = await import('@/lib/firebase');
      const displayName = firebaseAuth.currentUser?.displayName || '';
      if (!isHebrewName(displayName)) {
        setGoogleHebrewName('');
        setGoogleNameStep(true);
        setIsLoading(false);
      } else {
        router.push('/');
      }
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/unauthorized-domain') {
        setError('הדומיין הנוכחי לא מורשה. פנו למנהל המערכת.');
      } else if (firebaseError.code === 'auth/popup-blocked') {
        setError('הדפדפן חסם את החלון. אנא אפשרו חלונות קופצים ונסו שוב.');
      } else if (firebaseError.code === 'auth/popup-closed-by-user') {
        setError('');
      } else {
        setError('שגיאה בהתחברות עם Google. נסו שוב.');
      }
      setIsLoading(false);
    }
  };

  const handleGoogleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateName(googleHebrewName);
    if (err) { setGoogleNameError(err); return; }
    setIsLoading(true);
    try {
      const { updateProfile } = await import('firebase/auth');
      const { auth: firebaseAuth } = await import('@/lib/firebase');
      if (firebaseAuth.currentUser) {
        await updateProfile(firebaseAuth.currentUser, { displayName: googleHebrewName });
        // Patch the onboarding profile with the Hebrew name
        const token = await firebaseAuth.currentUser.getIdToken();
        await fetch('/api/me/onboarding', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: googleHebrewName }),
        });
      }
      router.push('/');
    } catch {
      setGoogleNameError('שגיאה בשמירת השם. נסה שוב.');
      setIsLoading(false);
    }
  };

  const handleTogglePhoneLogin = () => {
    setError('');
    setPhoneLoginOpen((open) => {
      if (open) {
        setPhoneStep('phone');
        setOtpCode('');
        setConfirmationResult(null);
        resetRecaptchaVerifier();
      }
      return !open;
    });
  };

  const handleSendPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      setError('Firebase לא מוגדר. יש להגדיר קובץ .env.local עם פרטי Firebase אמיתיים. ראה .env.local.example');
      return;
    }

    const formattedPhone = formatIsraeliPhoneForFirebase(phoneNumber);
    if (!formattedPhone) {
      setError('יש להזין מספר טלפון ישראלי תקין, לדוגמה 050-0000000');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const verifier = getRecaptchaVerifier();
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setPhoneStep('otp');
      setOtpCode('');
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string };
      if (
        firebaseError.code === 'auth/too-many-requests' ||
        firebaseError.code === 'auth/captcha-check-failed' ||
        firebaseError.code === 'auth/missing-app-credential' ||
        firebaseError.code === 'auth/invalid-app-credential'
      ) {
        resetRecaptchaVerifier();
      }

      if (firebaseError.code === 'auth/invalid-phone-number') {
        setError('מספר הטלפון לא תקין. בדקו את המספר ונסו שוב.');
      } else if (firebaseError.code === 'auth/too-many-requests') {
        setError('נשלחו יותר מדי בקשות. נסו שוב מאוחר יותר.');
      } else if (firebaseError.code === 'auth/quota-exceeded') {
        setError('לא ניתן לשלוח קוד כרגע. נסו שוב מאוחר יותר.');
      } else {
        setError('שגיאה בשליחת הקוד. נסו שוב.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpCode.trim();

    if (!confirmationResult) {
      setError('יש לשלוח קוד אימות לפני ההתחברות.');
      setPhoneStep('phone');
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError('יש להזין קוד בן 6 ספרות.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      await confirmationResult.confirm(code);
      resetRecaptchaVerifier();
      setPendingRedirect('/');
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code === 'auth/invalid-verification-code') {
        setError('קוד האימות שגוי. בדקו את הקוד ונסו שוב.');
      } else if (firebaseError.code === 'auth/code-expired') {
        setError('קוד האימות פג תוקף. שלחו קוד חדש.');
        setPhoneStep('phone');
        setConfirmationResult(null);
        resetRecaptchaVerifier();
      } else {
        setError('שגיאה באימות הקוד. נסו שוב.');
      }
      setIsLoading(false);
    }
  };

  const handleBackToPhoneNumber = () => {
    setError('');
    setPhoneStep('phone');
    setOtpCode('');
    setConfirmationResult(null);
    resetRecaptchaVerifier();
  };

  // Google name step
  if (googleNameStep) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-md"
        >
          <div className="bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg">
              <User className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-black text-[var(--theme-text)] mb-1">ברוך/ה הבא/ה!</h2>
            <p className="text-[var(--theme-text-secondary)] text-sm mb-6">
              כדי שנדע מי אתה/את, יש להזין שם בעברית
            </p>
            <form onSubmit={handleGoogleNameSubmit} className="space-y-4 text-right">
              <div>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
                  <input
                    type="text"
                    placeholder="שם מלא בעברית *"
                    value={googleHebrewName}
                    onChange={(e) => { setGoogleHebrewName(e.target.value); if (googleNameError) setGoogleNameError(''); }}
                    onBlur={() => setGoogleNameError(validateName(googleHebrewName))}
                    autoFocus
                    className={`w-full pr-11 pl-4 py-3 rounded-xl bg-[var(--theme-bg)] border text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:ring-1 outline-none transition-all text-sm ${
                      googleNameError
                        ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                        : 'border-[var(--theme-border)] focus:border-[var(--theme-accent)] focus:ring-[var(--theme-accent)]'
                    }`}
                  />
                </div>
                {googleNameError && <p className="mt-1 text-xs text-red-400 pr-1">{googleNameError}</p>}
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>המשך <ArrowLeft className="w-4 h-4" /></>}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  // Registration success screen
  if (registrationSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="relative w-full max-w-md text-center"
        >
          <div className="bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}
              className="flex justify-center mb-6"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-emerald-400" />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-2xl font-black text-[var(--theme-text)] mb-2">!הצטרפת בהצלחה</h2>
              <p className="text-[var(--theme-text-secondary)] text-sm mb-2">
                הבקשה שלך נשלחה למנהל ותאושר בקרוב
              </p>
              <p className="text-[var(--theme-text-secondary)] text-xs mb-8">
                תקבל/י התראה ברגע שהחשבון מאושר
              </p>
              <button
                onClick={() => router.push('/')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2"
              >
                המשך לאפליקציה
                <ArrowLeft className="w-4 h-4" />
              </button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    );
  }

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
              onClick={() => { setMode('login'); setError(''); setNameError(''); setPhoneError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                mode === 'login'
                  ? 'bg-gradient-to-l from-purple-500 to-blue-600 text-white shadow-lg'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
              }`}
            >
              כניסה
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setNameError(''); setPhoneError(''); }}
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

          {/* Error banner */}
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

          {/* --- Primary auth buttons --- */}
          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text)] font-semibold hover:bg-[var(--theme-accent-glow)] transition-all disabled:opacity-50 flex items-center justify-center gap-3 text-sm mb-3"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {mode === 'login' ? 'כניסה עם Google' : 'הרשמה עם Google'}
          </button>

          {/* Phone Sign In */}
          <button
            onClick={handleTogglePhoneLogin}
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text)] font-semibold hover:bg-[var(--theme-accent-glow)] transition-all disabled:opacity-50 flex items-center justify-center gap-3 text-sm"
          >
            <Phone className="w-5 h-5 shrink-0 text-[var(--theme-accent)]" />
            {mode === 'login' ? 'כניסה עם מספר טלפון' : 'הרשמה עם מספר טלפון'}
          </button>

          <AnimatePresence>
            {phoneLoginOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4"
                dir="rtl"
              >
                <div id="recaptcha-container" />

                {phoneStep === 'phone' ? (
                  <form onSubmit={handleSendPhoneCode} className="space-y-3">
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
                      <input
                        type="tel"
                        placeholder="050-0000000"
                        value={phoneNumber}
                        onChange={(e) => {
                          setPhoneNumber(e.target.value);
                          setError('');
                        }}
                        className="w-full pr-11 pl-4 py-3 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)] outline-none transition-all text-sm"
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          שלח קוד
                          <ArrowLeft className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyPhoneCode} className="space-y-3">
                    <input
                      type="text"
                      placeholder="קוד בן 6 ספרות"
                      value={otpCode}
                      onChange={(e) => {
                        setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setError('');
                      }}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)] outline-none transition-all text-sm text-center tracking-[0.3em]"
                      dir="ltr"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          אמת והתחבר
                          <ArrowLeft className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleBackToPhoneNumber}
                      disabled={isLoading}
                      className="w-full py-2.5 rounded-xl text-sm font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all disabled:opacity-50"
                    >
                      חזור
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* --- Secondary: Email --- */}
          <div className="flex items-center gap-4 my-5">
            <div className="flex-1 h-px bg-[var(--theme-border)]" />
            <span className="text-[var(--theme-text-secondary)] text-xs whitespace-nowrap">
              {mode === 'login' ? 'או כניסה עם אימייל' : 'או הרשמה עם אימייל'}
            </span>
            <div className="flex-1 h-px bg-[var(--theme-border)]" />
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4"
                >
                  {/* Hebrew Name (required) */}
                  <div>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
                      <input
                        type="text"
                        placeholder="שם מלא בעברית *"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (nameError) setNameError('');
                        }}
                        onBlur={() => setNameError(validateName(name))}
                        className={`w-full pr-11 pl-4 py-3 rounded-xl bg-[var(--theme-bg)] border text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:ring-1 outline-none transition-all text-sm ${
                          nameError
                            ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                            : 'border-[var(--theme-border)] focus:border-[var(--theme-accent)] focus:ring-[var(--theme-accent)]'
                        }`}
                      />
                    </div>
                    {nameError && (
                      <p className="mt-1 text-xs text-red-400 pr-1">{nameError}</p>
                    )}
                    {!nameError && (
                      <p className="mt-1 text-xs text-[var(--theme-text-secondary)] pr-1">יש להזין שם בעברית</p>
                    )}
                  </div>

                  {/* Phone (required) */}
                  <div>
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
                      <input
                        type="tel"
                        placeholder="מספר טלפון *"
                        value={registerPhone}
                        onChange={(e) => {
                          setRegisterPhone(e.target.value);
                          if (phoneError) setPhoneError('');
                        }}
                        onBlur={() => setPhoneError(validateRegisterPhone(registerPhone))}
                        className={`w-full pr-11 pl-4 py-3 rounded-xl bg-[var(--theme-bg)] border text-[var(--theme-text)] placeholder:text-[var(--theme-text-secondary)] focus:ring-1 outline-none transition-all text-sm ${
                          phoneError
                            ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                            : 'border-[var(--theme-border)] focus:border-[var(--theme-accent)] focus:ring-[var(--theme-accent)]'
                        }`}
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </div>
                    {phoneError && (
                      <p className="mt-1 text-xs text-red-400 pr-1">{phoneError}</p>
                    )}
                  </div>

                  {/* Department & Role (optional) */}
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={department}
                      onChange={(e) => {
                        setDepartment(e.target.value);
                        setRole('');
                      }}
                      className="py-3 px-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)] transition-all"
                    >
                      <option value="">מחלקה (אופציונלי)</option>
                      {INDUSTRY_DEPARTMENTS.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="py-3 px-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)] transition-all"
                    >
                      <option value="">תפקיד (אופציונלי)</option>
                      {roleOptions.map(r => (
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

            {/* Terms checkbox (register only) */}
            {mode === 'register' && (
              <label className="flex items-start gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 text-sm leading-relaxed text-[var(--theme-text-secondary)]">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    if (e.target.checked) setError('');
                  }}
                  required
                  className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--theme-border)] accent-[var(--theme-accent)]"
                />
                <span>
                  קראתי והסכמתי ל
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--theme-accent)] underline underline-offset-2 hover:opacity-80"
                  >
                    תנאי השימוש
                  </a>
                  {' '}ול
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--theme-accent)] underline underline-offset-2 hover:opacity-80"
                  >
                    מדיניות הפרטיות
                  </a>
                </span>
              </label>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isRegisterSubmitDisabled}
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

          {/* Feature highlights */}
          <div className="mt-6 pt-5 border-t border-[var(--theme-border)]">
            <div className="flex items-center gap-2 text-[var(--theme-text-secondary)] text-xs mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              מה מחכה לכם בפנים:
            </div>
            <div className="flex flex-wrap gap-2">
              {["צ'אט קבוצתי", 'שיחות וידאו', 'לוח מודעות', 'כלי הפקה', 'שידור חי'].map(f => (
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
