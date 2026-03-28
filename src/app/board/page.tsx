'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useRouter } from 'next/navigation';
import PostCard, { Post } from '@/components/board/PostCard';
import PostForm, { PostFormData } from '@/components/board/PostForm';
import UserAvatar from '@/components/UserAvatar';
import {
  Plus, Search, Briefcase, Package, Gift, Filter,
  TrendingUp, Clock, Megaphone, X, Send, MessageCircle
} from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  where, Timestamp, updateDoc, doc, increment, getDocs
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Comment type ───────────────────────────────────────────────────────────
interface Comment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  createdAt: number;
}

// ─── CommentsModal ───────────────────────────────────────────────────────────
function CommentsModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    try {
      const commentsRef = collection(db, 'posts', postId, 'comments');
      const q = query(commentsRef, orderBy('createdAt', 'asc'));
      const unsubscribe = onSnapshot(q, (snap) => {
        const loaded: Comment[] = [];
        snap.forEach(d => {
          const data = d.data();
          loaded.push({
            id: d.id,
            text: data.text,
            authorId: data.authorId,
            authorName: data.authorName,
            authorPhoto: data.authorPhoto || null,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
          });
        });
        setComments(loaded);
        setLoading(false);
      }, () => setLoading(false));
      return () => unsubscribe();
    } catch {
      setLoading(false);
    }
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user || !profile) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        text: text.trim(),
        authorId: user.uid,
        authorName: profile.displayName,
        authorPhoto: profile.photoURL || null,
        createdAt: serverTimestamp(),
      });
      // Also increment the comments counter on the post
      await updateDoc(doc(db, 'posts', postId), { comments: increment(1) });
      setCommentError('');
      setText('');
      inputRef.current?.focus();
    } catch {
      setCommentError('שגיאה בשליחת תגובה');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'עכשיו';
    if (minutes < 60) return `לפני ${minutes} דקות`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `לפני ${hours} שעות`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `לפני ${days} ימים` : new Date(ts).toLocaleDateString('he-IL');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border)]">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[var(--theme-accent)]" />
            <span className="font-bold text-sm text-[var(--theme-text)]">תגובות</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--theme-bg-secondary)] transition-all">
            <X className="w-4 h-4 text-[var(--theme-text-secondary)]" />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-[var(--theme-text-secondary)] py-6">טוען תגובות...</p>
          ) : comments.length === 0 ? (
            <p className="text-center text-sm text-[var(--theme-text-secondary)] py-6">אין תגובות עדיין. היה/י הראשון/ה!</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-2.5">
                <UserAvatar name={c.authorName} photoURL={c.authorPhoto} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-[var(--theme-text)]">{c.authorName}</span>
                    <span className="text-[10px] text-[var(--theme-text-secondary)]">{formatTime(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[var(--theme-text)] mt-0.5 break-words">{c.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[var(--theme-border)]">
          {commentError && (
            <p className="text-xs text-red-400 mb-2">{commentError}</p>
          )}
          {user ? (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="כתוב/י תגובה..."
                disabled={submitting}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-50"
                style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              />
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-l from-purple-500 to-blue-600 text-white disabled:opacity-40 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <p className="text-center text-xs text-[var(--theme-text-secondary)]">יש להתחבר כדי להגיב</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

const typeFilters = [
  { key: 'all', label: 'הכל', icon: Megaphone },
  { key: 'job_offer', label: 'הצעות עבודה', icon: Briefcase },
  { key: 'job_search', label: 'מחפשים עבודה', icon: Search },
  { key: 'equipment_sale', label: 'ציוד למכירה', icon: Package },
  { key: 'equipment_free', label: 'ציוד למסירה', icon: Gift },
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

export default function BoardPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>(demoPosts);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

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

  const filteredPosts = posts
    .filter(p => typeFilter === 'all' || p.type === typeFilter)
    .filter(p =>
      p.title.includes(search) ||
      p.description.includes(search) ||
      p.tags.some(t => t.includes(search)) ||
      p.authorName.includes(search)
    )
    .sort((a, b) => sortBy === 'newest' ? b.createdAt - a.createdAt : b.likes - a.likes);

  const handleSubmitPost = async (data: PostFormData) => {
    if (!user || !profile) return;

    try {
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
      showToast('הפרסום פורסם בהצלחה!', 'success');
    } catch {
      showToast('שגיאה בפרסום. נסה שוב.', 'error');
    }
  };

  const handleContact = (post: Post) => {
    if (post.authorId.startsWith('demo')) {
      showToast('הפוסט הוא דוגמה בלבד', 'info');
      return;
    }
    router.push(`/chat?userId=${post.authorId}`);
  };

  const handleOpenComments = (postId: string) => {
    setCommentsPostId(postId);
  };

  const handleLike = async (postId: string) => {
    if (!user) {
      showToast('יש להתחבר כדי לאהוב פרסום', 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'posts', postId), { likes: increment(1) });
    } catch {
      // Demo mode - local toggle
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p));
    }
  };

  const stats = {
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
            <h1 className="text-3xl font-black gradient-text mb-2">לוח מודעות</h1>
            <p className="text-[var(--theme-text-secondary)] text-sm">הצעות עבודה, חיפוש צוות וציוד לתעשיית הטלוויזיה</p>

            {/* Stats */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="text-center">
                <p className="text-xl font-black text-green-400">{stats.jobs}</p>
                <p className="text-xs text-[var(--theme-text-secondary)]">הצעות עבודה</p>
              </div>
              <div className="w-px h-8 bg-[var(--theme-border)]" />
              <div className="text-center">
                <p className="text-xl font-black text-blue-400">{stats.seeking}</p>
                <p className="text-xs text-[var(--theme-text-secondary)]">מחפשים עבודה</p>
              </div>
              <div className="w-px h-8 bg-[var(--theme-border)]" />
              <div className="text-center">
                <p className="text-xl font-black text-orange-400">{stats.equipment}</p>
                <p className="text-xs text-[var(--theme-text-secondary)]">פריטי ציוד</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Toolbar */}
      <section className="sticky top-16 z-30 border-b border-[var(--theme-border)] backdrop-blur-xl" style={{ background: 'var(--theme-nav-bg)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
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
        </div>
      </section>

      {/* Posts Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
                onContact={() => handleContact(post)}
                onComments={() => handleOpenComments(post.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* New Post Form Modal */}
      {showForm && (
        <PostForm onSubmit={handleSubmitPost} onClose={() => setShowForm(false)} />
      )}

      {/* Comments Modal */}
      <AnimatePresence>
        {commentsPostId && (
          <CommentsModal
            postId={commentsPostId}
            onClose={() => setCommentsPostId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
