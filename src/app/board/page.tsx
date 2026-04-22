'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import PostCard, { Post } from '@/components/board/PostCard';
import PostForm, { PostFormData } from '@/components/board/PostForm';
import { mockJobs, type Job } from '@/data/jobs';
import {
  Plus, Search, Briefcase, Package, Gift, Filter, SlidersHorizontal,
  TrendingUp, Clock, Megaphone, Bookmark, BookmarkCheck, MapPin, DollarSign,
  Calendar, AlertTriangle, Users, Send, Flame, Zap, Tag
} from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  where, Timestamp, updateDoc, doc, increment, setDoc, deleteDoc, getDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

const typeFilters = [
  { key: 'all', label: 'הכל', icon: Megaphone },
  { key: 'job_offer', label: 'הצעות עבודה', icon: Briefcase },
  { key: 'job_search', label: 'מחפשים עבודה', icon: Search },
  { key: 'equipment_sale', label: 'ציוד למכירה', icon: Package },
  { key: 'equipment_free', label: 'ציוד למסירה', icon: Gift },
];

const departmentFilters = [
  { key: 'all', label: 'הכל' },
  { key: 'צילום', label: 'צילום' },
  { key: 'טכני', label: 'טכני' },
  { key: 'הפקה', label: 'הפקה' },
  { key: 'סאונד', label: 'סאונד' },
  { key: 'תאורה', label: 'תאורה' },
];

const locationFilters = [
  { key: 'all', label: 'הכל' },
  { key: 'תל אביב', label: 'תל אביב' },
  { key: 'ירושלים', label: 'ירושלים' },
  { key: 'חיפה', label: 'חיפה' },
  { key: 'צפון', label: 'צפון' },
  { key: 'דרום', label: 'דרום' },
];

// Demo posts for when Firebase is not connected
const demoPosts: Post[] = [
  {
    id: '1', type: 'job_offer', title: 'דרוש/ה צלם/ת לסדרת דרמה חדשה',
    description: 'מחפשים צלם/ת מנוסה לסדרת דרמה חדשה של ערוץ 12. נדרש ניסיון של לפחות 3 שנים בצילום דרמה. צילומים באזור תל אביב.',
    category: 'צילום', location: 'תל אביב', salary: '2,500-3,500 ליום', price: '',
    imageURL: null, tags: ['צילום', 'דרמה', 'סדרה', 'ערוץ 12'],
    authorId: 'demo1', authorName: 'דנה כהן', authorPhoto: null, authorRole: 'מנהלת הפקה',
    views: 245, likes: 18, comments: 7, createdAt: Date.now() - 3600000 * 2, isActive: true
  },
  {
    id: '2', type: 'equipment_sale', title: 'Sony A7S III - מצב מעולה',
    description: 'למכירה Sony A7S III במצב מעולה, כ-5000 שעות הפעלה. כולל 2 סוללות, מטען כפול ותיק. אחריות עד 2026.',
    category: 'מצלמות', location: 'ראשון לציון', salary: '', price: '8,500',
    imageURL: null, tags: ['Sony', 'מצלמה', 'A7S III', 'Full Frame'],
    authorId: 'demo2', authorName: 'יוסי לוי', authorPhoto: null, authorRole: 'צלם',
    views: 189, likes: 12, comments: 3, createdAt: Date.now() - 3600000 * 5, isActive: true
  },
  {
    id: '3', type: 'job_search', title: 'עורך/ת וידאו מנוסה מחפש/ת עבודה',
    description: 'עורך וידאו עם 7 שנות ניסיון בעריכת תוכניות טלוויזיה, פרומואים וסדרות דוקומנטריות. שליטה מלאה ב-Avid, Premiere ו-DaVinci.',
    category: 'עריכה', location: 'מרכז', salary: 'לפי סיכום', price: '',
    imageURL: null, tags: ['עריכה', 'Avid', 'Premiere', 'דוקומנטרי'],
    authorId: 'demo3', authorName: 'מיכל אברהם', authorPhoto: null, authorRole: 'עורכת',
    views: 132, likes: 9, comments: 5, createdAt: Date.now() - 3600000 * 8, isActive: true
  },
  {
    id: '4', type: 'equipment_free', title: 'מוניטור שטח 5" - למסירה',
    description: 'מוניטור שטח 5 אינץ׳ ישן אך עובד מצוין. מתאים כמוניטור נוסף או גיבוי. כולל זרוע הרכבה.',
    category: 'מצלמות', location: 'חיפה', salary: '', price: '',
    imageURL: null, tags: ['מוניטור', 'ציוד', 'חינם'],
    authorId: 'demo4', authorName: 'ערן גולדברג', authorPhoto: null, authorRole: 'טכנאי',
    views: 67, likes: 4, comments: 2, createdAt: Date.now() - 3600000 * 24, isActive: true
  },
  {
    id: '5', type: 'job_offer', title: 'דרוש/ה מנהל/ת הפקה - ריאליטי חדש',
    description: 'רשת 13 מחפשת מנהל/ת הפקה לפרויקט ריאליטי חדש ומרגש. נדרש ניסיון בניהול הפקות גדולות. התפקיד מלא, 6 חודשים.',
    category: 'הפקה', location: 'נווה אילן', salary: 'שכר גבוה + בונוסים', price: '',
    imageURL: null, tags: ['הפקה', 'ריאליטי', 'רשת 13', 'ניהול'],
    authorId: 'demo5', authorName: 'אלון שמעוני', authorPhoto: null, authorRole: 'סגן מנכ"ל',
    views: 312, likes: 24, comments: 14, createdAt: Date.now() - 3600000 * 1, isActive: true
  },
  {
    id: '6', type: 'job_offer', title: 'מחפשים מאפרת לצילומי קליפ',
    description: 'דרושה מאפרת מקצועית ליום צילומים אחד של קליפ מוזיקלי. הצילומים ביום חמישי הקרוב בתל אביב. סגנון - גלאם.',
    category: 'אחר', location: 'תל אביב', salary: '1,800 ליום', price: '',
    imageURL: null, tags: ['איפור', 'קליפ', 'מוזיקה'],
    authorId: 'demo6', authorName: 'שירה מזרחי', authorPhoto: null, authorRole: 'במאית',
    views: 98, likes: 6, comments: 3, createdAt: Date.now() - 3600000 * 12, isActive: true
  },
];

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `לפני ${days} ${days === 1 ? 'יום' : 'ימים'}`;
  if (hours > 0) return `לפני ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
  return 'עכשיו';
}

function formatJobDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isNewThisWeek(timestamp: number): boolean {
  const weekAgo = Date.now() - 7 * 24 * 3600000;
  return timestamp > weekAgo;
}

function JobCard({ job, savedJobs, onToggleSave }: { job: Job; savedJobs: Set<string>; onToggleSave: (id: string) => void }) {
  const isSaved = savedJobs.has(job.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-4 sm:p-5 transition-all hover:shadow-lg"
      style={{
        background: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-border)',
      }}
    >
      {/* Urgent badge */}
      {job.urgent && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/20">
            <Zap className="w-3 h-3" />
            דחוף
          </span>
        </div>
      )}

      {/* Title */}
      <h3 className="text-base font-bold mb-1" style={{ color: 'var(--theme-text)' }}>
        {job.title}
      </h3>

      {/* Production name */}
      <p className="text-sm mb-3" style={{ color: 'var(--theme-accent)' }}>
        {job.productionName}
      </p>

      {/* Info row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
        <span className="inline-flex items-center gap-1">
          <Briefcase className="w-3.5 h-3.5" />
          {job.roleNeeded}
        </span>
        <span style={{ color: 'var(--theme-border)' }}>|</span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          {job.location}
        </span>
        <span style={{ color: 'var(--theme-border)' }}>|</span>
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {formatJobDate(job.date)}
        </span>
      </div>

      {/* Rate */}
      <div className="flex items-center gap-1.5 mb-3 text-sm font-semibold text-green-400">
        <DollarSign className="w-4 h-4" />
        {job.rate}
      </div>

      {/* Description */}
      <p
        className="text-sm mb-3 leading-relaxed"
        style={{
          color: 'var(--theme-text-secondary)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {job.description}
      </p>

      {/* Requirements tags */}
      {job.requirements && job.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {job.requirements.map((req, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
              style={{
                background: 'var(--theme-accent-glow)',
                color: 'var(--theme-accent)',
              }}
            >
              <Tag className="w-3 h-3" />
              {req}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => alert('מועמדות נשלחה!')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(to left, var(--theme-accent), #7c3aed)',
          }}
        >
          <Send className="w-4 h-4" />
          הגש מועמדות
        </button>
        <button
          onClick={() => onToggleSave(job.id)}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            border: isSaved ? '1px solid var(--theme-accent)' : '1px solid var(--theme-border)',
            color: isSaved ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
            background: isSaved ? 'var(--theme-accent-glow)' : 'transparent',
          }}
        >
          {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          {isSaved ? 'נשמר' : 'שמור'}
        </button>
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 text-xs pt-2" style={{ color: 'var(--theme-text-secondary)', borderTop: '1px solid var(--theme-border)' }}>
        <span>{formatTimeAgo(job.postedAt)}</span>
        {job.applicants !== undefined && (
          <>
            <span style={{ color: 'var(--theme-border)' }}>|</span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {job.applicants} מועמדים
            </span>
          </>
        )}
        {job.saved !== undefined && (
          <>
            <span style={{ color: 'var(--theme-border)' }}>|</span>
            <span className="inline-flex items-center gap-1">
              <Bookmark className="w-3 h-3" />
              {job.saved} שמירות
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function BoardPage() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'jobs' | 'general'>('jobs');
  const [posts, setPosts] = useState<Post[]>(demoPosts);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');

  // Jobs tab state
  const [jobSearch, setJobSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());

  // Subscribe to posts from Firestore
  useEffect(() => {
    try {
      const postsRef = collection(db, 'posts');
      const q = query(postsRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const firestorePosts: Post[] = [];
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            firestorePosts.push({
              id: docSnap.id,
              type: data.type,
              title: data.title,
              description: data.description,
              category: data.category || '',
              location: data.location || '',
              salary: data.salary || '',
              price: data.price || '',
              imageURL: data.imageURL || null,
              tags: data.tags || [],
              authorId: data.authorId,
              authorName: data.authorName,
              authorPhoto: data.authorPhoto || null,
              authorRole: data.authorRole || '',
              views: data.views || 0,
              likes: data.likes || 0,
              comments: data.comments || 0,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
              isActive: data.isActive !== false,
            });
          });
          // Merge: real posts first, then demo as fallback
          setPosts(firestorePosts.length > 0 ? firestorePosts : demoPosts);
        }
      }, () => {
        // On error (e.g. no Firebase config), keep demo data
      });

      return () => unsubscribe();
    } catch {
      // Firebase not configured, use demo data
    }
  }, []);

  // General tab filters
  const filteredPosts = posts
    .filter(p => typeFilter === 'all' || p.type === typeFilter)
    .filter(p =>
      p.title.includes(search) ||
      p.description.includes(search) ||
      p.tags.some(t => t.includes(search)) ||
      p.authorName.includes(search)
    )
    .sort((a, b) => sortBy === 'newest' ? b.createdAt - a.createdAt : b.likes - a.likes);

  // Jobs tab filters
  const filteredJobs = mockJobs
    .filter(j => {
      if (departmentFilter !== 'all' && j.department !== departmentFilter) return false;
      if (locationFilter !== 'all' && !j.location.includes(locationFilter)) return false;
      if (urgentOnly && !j.urgent) return false;
      if (jobSearch) {
        const s = jobSearch.toLowerCase();
        return (
          j.title.includes(s) ||
          j.productionName.includes(s) ||
          j.roleNeeded.includes(s) ||
          j.description.includes(s) ||
          j.department.includes(s)
        );
      }
      return true;
    })
    .sort((a, b) => b.postedAt - a.postedAt);

  const handleSubmitPost = async (data: PostFormData) => {
    if (!user || !profile) return;

    let imageURL = null;
    if (data.image) {
      const storageRef = ref(storage, `board/${Date.now()}_${data.image.name}`);
      await uploadBytes(storageRef, data.image);
      imageURL = await getDownloadURL(storageRef);
    }

    await addDoc(collection(db, 'posts'), {
      ...data,
      image: undefined,
      imageURL,
      authorId: user.uid,
      authorName: profile.displayName,
      authorPhoto: profile.photoURL,
      authorRole: profile.role || '',
      views: 0,
      likes: 0,
      comments: 0,
      isActive: true,
      createdAt: serverTimestamp(),
    });

    setShowForm(false);
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const likeRef = doc(db, 'posts', postId, 'likes', user.uid);
    try {
      const likeSnap = await getDoc(likeRef);
      if (likeSnap.exists()) {
        // Already liked → unlike
        await deleteDoc(likeRef);
        await updateDoc(doc(db, 'posts', postId), { likes: increment(-1) });
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: Math.max(0, p.likes - 1) } : p));
      } else {
        // New like
        await setDoc(likeRef, { likedAt: Date.now() });
        await updateDoc(doc(db, 'posts', postId), { likes: increment(1) });
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p));
      }
    } catch {
      // Fallback - local toggle
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p));
    }
  };

  const handleToggleSave = (jobId: string) => {
    setSavedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const jobStats = {
    total: mockJobs.length,
    urgent: mockJobs.filter(j => j.urgent).length,
    newThisWeek: mockJobs.filter(j => isNewThisWeek(j.postedAt)).length,
  };

  const generalStats = {
    jobs: posts.filter(p => p.type === 'job_offer').length,
    seeking: posts.filter(p => p.type === 'job_search').length,
    equipment: posts.filter(p => p.type === 'equipment_sale' || p.type === 'equipment_free').length,
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[var(--theme-border)]">
        <div className="absolute inset-0 bg-gradient-to-bl from-orange-900/10 via-transparent to-purple-900/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="text-3xl font-black gradient-text mb-2">לוח עבודות</h1>
            <p className="text-[var(--theme-text-secondary)] text-sm">משרות, הפקות וציוד לתעשיית הטלוויזיה</p>

            {/* Tab-specific stats */}
            {activeTab === 'jobs' ? (
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="text-center">
                  <p className="text-xl font-black text-green-400">{jobStats.total}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">משרות פתוחות</p>
                </div>
                <div className="w-px h-8 bg-[var(--theme-border)]" />
                <div className="text-center">
                  <p className="text-xl font-black text-red-400">{jobStats.urgent}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">דחופות</p>
                </div>
                <div className="w-px h-8 bg-[var(--theme-border)]" />
                <div className="text-center">
                  <p className="text-xl font-black text-blue-400">{jobStats.newThisWeek}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">חדשות השבוע</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="text-center">
                  <p className="text-xl font-black text-green-400">{generalStats.jobs}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">הצעות עבודה</p>
                </div>
                <div className="w-px h-8 bg-[var(--theme-border)]" />
                <div className="text-center">
                  <p className="text-xl font-black text-blue-400">{generalStats.seeking}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">מחפשים עבודה</p>
                </div>
                <div className="w-px h-8 bg-[var(--theme-border)]" />
                <div className="text-center">
                  <p className="text-xl font-black text-orange-400">{generalStats.equipment}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">פריטי ציוד</p>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Main Tabs */}
      <section className="sticky z-30 border-b border-[var(--theme-border)] backdrop-blur-xl" style={{ background: 'var(--theme-nav-bg)', top: 'var(--app-header-offset)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Tab switcher */}
          <div className="flex gap-0 border-b border-[var(--theme-border)]">
            <button
              onClick={() => setActiveTab('jobs')}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all ${
                activeTab === 'jobs'
                  ? 'text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              משרות
              {activeTab === 'jobs' && (
                <motion.div
                  layoutId="tabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: 'var(--theme-accent)' }}
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all ${
                activeTab === 'general'
                  ? 'text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
              }`}
            >
              <Megaphone className="w-4 h-4" />
              מודעות כלליות
              {activeTab === 'general' && (
                <motion.div
                  layoutId="tabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: 'var(--theme-accent)' }}
                />
              )}
            </button>
          </div>

          {/* Jobs Tab Toolbar */}
          {activeTab === 'jobs' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-3 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
                <input
                  type="text"
                  value={jobSearch}
                  onChange={e => setJobSearch(e.target.value)}
                  placeholder="חיפוש משרות..."
                  className="w-full pr-10 pl-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                />
              </div>

              {/* Department filter pills */}
              <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-1">
                {departmentFilters.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setDepartmentFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      departmentFilter === f.key
                        ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                        : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Location + Urgent row */}
              <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
                <MapPin className="w-3.5 h-3.5 text-[var(--theme-text-secondary)] flex-shrink-0" />
                {locationFilters.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setLocationFilter(f.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                      locationFilter === f.key
                        ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                        : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <div className="w-px h-5 bg-[var(--theme-border)] mx-1 flex-shrink-0" />
                <button
                  onClick={() => setUrgentOnly(!urgentOnly)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                    urgentOnly
                      ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                      : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                  }`}
                >
                  <Flame className="w-3 h-3" />
                  דחוף בלבד
                </button>
              </div>
            </motion.div>
          )}

          {/* General Tab Toolbar */}
          {activeTab === 'general' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-3">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="חיפוש פרסומים..."
                    className="w-full pr-10 pl-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>

                {/* Sort */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setSortBy('newest')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      sortBy === 'newest' ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    חדש
                  </button>
                  <button
                    onClick={() => setSortBy('popular')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      sortBy === 'popular' ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    פופולרי
                  </button>
                </div>

                {/* New Post */}
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white text-sm font-bold hover:shadow-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                  פרסום חדש
                </button>
              </div>

              {/* Type Filters */}
              <div className="flex gap-1 mt-3 overflow-x-auto hide-scrollbar pb-1">
                {typeFilters.map(f => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setTypeFilter(f.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        typeFilter === f.key
                          ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                          : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'jobs' ? (
            <motion.div
              key="jobs"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              {filteredJobs.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="w-12 h-12 mx-auto text-[var(--theme-text-secondary)] opacity-30 mb-3" />
                  <p className="text-[var(--theme-text-secondary)]">לא נמצאו משרות מתאימות</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      savedJobs={savedJobs}
                      onToggleSave={handleToggleSave}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="general"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {filteredPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Megaphone className="w-12 h-12 mx-auto text-[var(--theme-text-secondary)] opacity-30 mb-3" />
                  <p className="text-[var(--theme-text-secondary)]">לא נמצאו פרסומים</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
                  {filteredPosts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onLike={() => handleLike(post.id)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* New Post Form Modal */}
      {showForm && (
        <PostForm onSubmit={handleSubmitPost} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
