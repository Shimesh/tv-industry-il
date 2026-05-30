'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Tag, Zap, Plus, Trash2 } from 'lucide-react';
import { LISTING_TYPE_CONFIG, PRICE_UNIT_LABELS, type ListingType, type PriceUnit } from '@/lib/boardTypes';
import { PROFILE_DEPARTMENT_OPTIONS } from '@/constants/departments';
import { useAuth } from '@/contexts/AuthContext';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const TYPES_WITHOUT_PRICE: ListingType[] = ['job_search', 'equipment_free', 'wanted'];
const PRICE_UNITS = Object.entries(PRICE_UNIT_LABELS) as [PriceUnit, string][];

interface Props {
  onCreated: () => void;
  onClose: () => void;
}

export default function NewListingModal({ onCreated, onClose }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<ListingType>('job_offer');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('negotiable');
  const [price, setPrice] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [location, setLocation] = useState('');
  const [department, setDepartment] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const cfg = LISTING_TYPE_CONFIG[type];
  const showPrice = !TYPES_WITHOUT_PRICE.includes(type);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#+/, '');
    if (t && !tags.includes(t) && tags.length < 8) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - mediaFiles.length);
    if (!files.length) return;
    setMediaFiles(prev => [...prev, ...files]);
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      setMediaPreviews(prev => [...prev, url]);
    });
    e.target.value = '';
  };

  const removeMedia = (i: number) => {
    URL.revokeObjectURL(mediaPreviews[i]);
    setMediaFiles(prev => prev.filter((_, idx) => idx !== i));
    setMediaPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!title.trim() || !description.trim()) { setError('נא למלא כותרת ותיאור'); return; }

    setSubmitting(true);
    setError('');

    try {
      const mediaUrls: string[] = [];
      for (const file of mediaFiles) {
        const storageRef = ref(storage, `board/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        mediaUrls.push(await getDownloadURL(storageRef));
      }

      const token = await user.getIdToken();
      const body = {
        type, title: title.trim(), description: description.trim(),
        priceUnit: showPrice ? priceUnit : undefined,
        price: showPrice && price ? parseFloat(price) : undefined,
        priceMax: showPrice && priceMax ? parseFloat(priceMax) : undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        location: location.trim() || undefined,
        department: department || undefined,
        tags,
        isUrgent,
        mediaUrls,
      };

      const res = await fetch('/api/board/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) { setError(data.error ?? 'שגיאה בשמירה'); return; }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          className="w-full sm:max-w-xl max-h-[95dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center gap-3 px-5 py-4 border-b z-10" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              📢
            </div>
            <div>
              <h2 className="text-base font-black" style={{ color: 'var(--theme-text)' }}>פרסום מודעה חדשה</h2>
              <p className="text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>מלא/י את הפרטים ולחץ/י פרסם</p>
            </div>
            <button onClick={onClose} className="mr-auto p-1 rounded-lg hover:bg-white/5 transition-colors">
              <X className="w-5 h-5" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Type selector */}
            <div>
              <label className="block text-xs font-bold mb-2" style={{ color: 'var(--theme-text-secondary)' }}>
                סוג מודעה
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.entries(LISTING_TYPE_CONFIG) as [ListingType, typeof LISTING_TYPE_CONFIG[ListingType]][]).map(([t, c]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="px-2 py-2 rounded-xl text-[11px] font-bold text-center transition-all"
                    style={{
                      background: type === t ? c.bg : 'transparent',
                      color: type === t ? c.color : 'var(--theme-text-secondary)',
                      border: `1px solid ${type === t ? c.border : 'var(--theme-border)'}`,
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>כותרת *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="כותרת קצרה וברורה..."
                maxLength={120}
                required
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>תיאור *</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="תאר/י את המודעה בפירוט..."
                rows={4}
                maxLength={1000}
                required
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all resize-none"
                style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
              />
            </div>

            {/* Price section */}
            {showPrice && (
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>מחיר</label>
                <div className="flex gap-2">
                  <select
                    value={priceUnit}
                    onChange={e => setPriceUnit(e.target.value as PriceUnit)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                  >
                    {PRICE_UNITS.map(([val, lbl]) => (
                      <option key={val} value={val}>{lbl}</option>
                    ))}
                  </select>
                  {priceUnit !== 'free' && priceUnit !== 'negotiable' && (
                    <>
                      <input
                        type="number"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        placeholder="מחיר"
                        min={0}
                        className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                      />
                      <input
                        type="number"
                        value={priceMax}
                        onChange={e => setPriceMax(e.target.value)}
                        placeholder="עד (אופציונלי)"
                        min={0}
                        className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Contact */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>טלפון</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="050-0000000"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>אימייל</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="me@example.com"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                />
              </div>
            </div>

            {/* Location + Department */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>מיקום</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="תל אביב, ירושלים..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>מחלקה</label>
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                >
                  <option value="">כל המחלקות</option>
                  {PROFILE_DEPARTMENT_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>
                תגיות <span className="font-normal opacity-60">(עד 8)</span>
              </label>
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <Tag className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--theme-text-secondary)' }} />
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder="הוסף תגית..."
                    className="w-full pr-9 pl-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--theme-bg)', border: `1px solid var(--theme-border)`, color: 'var(--theme-text)' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={addTag}
                  className="px-3 py-2 rounded-xl"
                  style={{ background: 'var(--theme-accent-glow)', color: 'var(--theme-accent)' }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                    >
                      #{t}
                      <button type="button" onClick={() => setTags(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Media */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>
                מדיה <span className="font-normal opacity-60">(תמונות / וידאו, עד 6)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleMediaSelect}
              />
              {mediaPreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {mediaPreviews.map((url, i) => (
                    <div key={i} className="relative aspect-video rounded-xl overflow-hidden group">
                      {mediaFiles[i]?.type.startsWith('video') ? (
                        <video src={url} className="w-full h-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(i)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {mediaFiles.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    background: 'var(--theme-bg)',
                    border: `2px dashed var(--theme-border)`,
                    color: 'var(--theme-text-secondary)',
                  }}
                >
                  <Upload className="w-4 h-4" />
                  העלה תמונות / וידאו
                </button>
              )}
            </div>

            {/* Urgent toggle */}
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-colors hover:bg-white/3"
              style={{ border: '1px solid var(--theme-border)' }}>
              <div
                className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
                style={{ background: isUrgent ? '#ef4444' : 'var(--theme-border)' }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ right: isUrgent ? '2px' : 'calc(100% - 18px)' }}
                />
              </div>
              <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} className="hidden" />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
                  <Zap className="w-3.5 h-3.5 text-red-400" />
                  מודעה דחופה
                </div>
                <p className="text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>תסומן כ-דחוף ותקבל בולטות מוגברת</p>
              </div>
            </label>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(135deg, ${cfg.color}, var(--theme-accent))` }}
            >
              {submitting ? 'שומר...' : '📢 פרסם מודעה'}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
