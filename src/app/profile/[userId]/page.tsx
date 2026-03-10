'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import {
  User, Mail, Phone, Briefcase, MapPin, MessageCircle,
  PhoneCall, ArrowRight, Clock, Shield
} from 'lucide-react';
import { motion } from 'framer-motion';

const statusLabels: Record<string, { label: string; color: string; bgColor: string }> = {
  available: { label: 'פנוי', color: 'text-green-300', bgColor: 'bg-green-500/10' },
  busy: { label: 'תפוס', color: 'text-red-300', bgColor: 'bg-red-500/10' },
  offline: { label: 'לא פעיל', color: 'text-gray-300', bgColor: 'bg-gray-500/10' },
};

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profileRef = doc(db, 'users', userId);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setProfile({ uid: userId, ...profileSnap.data() } as UserProfile);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    };
    if (userId) fetchProfile();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{
          borderColor: 'var(--theme-border)',
          borderTopColor: 'var(--theme-accent)',
        }} />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-20 h-20 rounded-full bg-[var(--theme-bg-secondary)] flex items-center justify-center">
          <User className="w-10 h-10 text-[var(--theme-text-secondary)]" />
        </div>
        <h1 className="text-xl font-bold text-[var(--theme-text)]">משתמש לא נמצא</h1>
        <p className="text-[var(--theme-text-secondary)] text-sm">הפרופיל המבוקש אינו קיים או שהוסר</p>
        <Link
          href="/directory"
          className="mt-2 px-5 py-2.5 rounded-xl bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-sm font-bold hover:bg-[var(--theme-accent)] hover:text-white transition-all flex items-center gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לאלפון
        </Link>
      </div>
    );
  }

  const statusInfo = statusLabels[profile.status] || statusLabels.offline;
  const isOwnProfile = user?.uid === userId;

  return (
    <div className="min-h-screen">
      {/* Header Banner */}
      <section className="relative overflow-hidden border-b border-[var(--theme-border)]">
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center gap-6"
          >
            {/* Avatar */}
            <UserAvatar name={profile.displayName} photoURL={profile.photoURL} size="xl" isOnline={profile.isOnline} />

            <div className="text-center sm:text-right flex-1">
              <h1 className="text-2xl font-black text-[var(--theme-text)]">{profile.displayName}</h1>
              <div className="flex items-center justify-center sm:justify-start gap-3 mt-2 flex-wrap">
                {profile.role && (
                  <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 text-sm flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" />
                    {profile.role}
                  </span>
                )}
                {profile.department && (
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-300 text-sm flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {profile.department}
                  </span>
                )}
                <span className={`px-3 py-1 rounded-full text-sm flex items-center gap-1.5 ${statusInfo.bgColor} ${statusInfo.color}`}>
                  <span className={`w-2 h-2 rounded-full ${profile.status === 'available' ? 'bg-green-500' : profile.status === 'busy' ? 'bg-red-500' : 'bg-gray-500'}`} />
                  {statusInfo.label}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            {!isOwnProfile && user && (
              <div className="flex gap-2">
                <Link
                  href="/chat"
                  className="px-4 py-2 rounded-xl bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-sm font-bold flex items-center gap-2 hover:bg-[var(--theme-accent)] hover:text-white transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  שלח הודעה
                </Link>
                <button
                  className="px-4 py-2 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-secondary)] text-sm font-bold flex items-center gap-2 hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-accent)] transition-all"
                >
                  <PhoneCall className="w-4 h-4" />
                  התקשר
                </button>
              </div>
            )}

            {isOwnProfile && (
              <Link
                href="/profile"
                className="px-4 py-2 rounded-xl bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-sm font-bold flex items-center gap-2 hover:bg-[var(--theme-accent)] hover:text-white transition-all"
              >
                ערוך פרופיל
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Info Card */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
              <h2 className="text-lg font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-[var(--theme-accent)]" />
                פרטים אישיים
              </h2>
              <div className="space-y-3">
                <InfoRow icon={<Mail className="w-4 h-4" />} label="אימייל" value={profile.email} />
                <InfoRow icon={<Phone className="w-4 h-4" />} label="טלפון" value={profile.phone || 'לא צוין'} />
                <InfoRow icon={<Briefcase className="w-4 h-4" />} label="תפקיד" value={profile.role || 'לא צוין'} />
                <InfoRow icon={<MapPin className="w-4 h-4" />} label="מחלקה" value={profile.department || 'לא צוין'} />
                {profile.bio && (
                  <div className="pt-3 border-t border-[var(--theme-border)]">
                    <p className="text-sm text-[var(--theme-text-secondary)]">{profile.bio}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
                <h2 className="text-lg font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[var(--theme-accent)]" />
                  מיומנויות
                </h2>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
              <h2 className="text-lg font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--theme-accent)]" />
                סטטוס
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${profile.status === 'available' ? 'bg-green-500' : profile.status === 'busy' ? 'bg-red-500' : 'bg-gray-500'}`} />
                  <span className="text-sm font-medium text-[var(--theme-text)]">{statusInfo.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${profile.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                  <span className="text-sm text-[var(--theme-text-secondary)]">
                    {profile.isOnline ? 'מחובר/ת כעת' : 'לא מחובר/ת'}
                  </span>
                </div>
              </div>
            </div>

            {/* Back link */}
            <Link
              href="/directory"
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-secondary)] text-sm font-medium hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-accent)] transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              חזרה לאלפון
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-[var(--theme-accent)]">{icon}</span>
      <span className="text-sm text-[var(--theme-text-secondary)] w-16">{label}</span>
      <span className="text-sm text-[var(--theme-text)] font-medium">{value}</span>
    </div>
  );
}
