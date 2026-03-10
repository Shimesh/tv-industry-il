'use client';

import { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Tag } from 'lucide-react';

interface PostFormProps {
  onSubmit: (data: PostFormData) => Promise<void>;
  onClose: () => void;
}

export interface PostFormData {
  type: 'job_offer' | 'job_search' | 'equipment_sale' | 'equipment_free';
  title: string;
  description: string;
  category: string;
  location: string;
  salary: string;
  price: string;
  tags: string[];
  image: File | null;
}

const categories = {
  job_offer: ['הפקה', 'צילום', 'עריכה', 'סאונד', 'תאורה', 'במאות', 'כתיבה', 'שחקנות', 'גרפיקה', 'אחר'],
  job_search: ['הפקה', 'צילום', 'עריכה', 'סאונד', 'תאורה', 'במאות', 'כתיבה', 'שחקנות', 'גרפיקה', 'אחר'],
  equipment_sale: ['מצלמות', 'עדשות', 'תאורה', 'סאונד', 'חצובות', 'מייצבים', 'מחשבים', 'אחר'],
  equipment_free: ['מצלמות', 'עדשות', 'תאורה', 'סאונד', 'חצובות', 'מייצבים', 'מחשבים', 'אחר'],
};

const typeOptions = [
  { value: 'job_offer', label: '🟢 הצעת עבודה' },
  { value: 'job_search', label: '🔵 חיפוש עבודה' },
  { value: 'equipment_sale', label: '🟠 ציוד למכירה' },
  { value: 'equipment_free', label: '🟣 ציוד למסירה' },
];

export default function PostForm({ onSubmit, onClose }: PostFormProps) {
  const [form, setForm] = useState<PostFormData>({
    type: 'job_offer',
    title: '',
    description: '',
    category: '',
    location: '',
    salary: '',
    price: '',
    tags: [],
    image: null,
  });
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setForm(prev => ({ ...prev, image: file }));
      setPreviewImage(URL.createObjectURL(file));
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag) && form.tags.length < 6) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  const showSalary = form.type === 'job_offer' || form.type === 'job_search';
  const showPrice = form.type === 'equipment_sale';
  const currentCategories = categories[form.type] || [];

  const inputStyle = {
    background: 'var(--theme-bg)',
    border: '1px solid var(--theme-border)',
    color: 'var(--theme-text)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden my-8"
        style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--theme-border)]">
          <h2 className="text-lg font-bold text-[var(--theme-text)]">פרסום חדש</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-all">
            <X className="w-5 h-5 text-[var(--theme-text-secondary)]" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Type */}
          <div>
            <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">סוג פרסום</label>
            <div className="grid grid-cols-2 gap-2">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, type: opt.value as PostFormData['type'], category: '' }))}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    form.type === opt.value
                      ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] border-[var(--theme-accent)]'
                      : 'text-[var(--theme-text-secondary)] border-[var(--theme-border)] hover:border-[var(--theme-accent)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">כותרת *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="כותרת קצרה וברורה"
              required
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">תיאור *</label>
            <textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="תארו בפירוט את ההצעה / הדרישה..."
              required
              rows={4}
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={inputStyle}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">קטגוריה</label>
            <div className="flex flex-wrap gap-1.5">
              {currentCategories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, category: cat }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    form.category === cat
                      ? 'bg-[var(--theme-accent)] text-white'
                      : 'bg-[var(--theme-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">מיקום</label>
            <input
              type="text"
              value={form.location}
              onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
              placeholder="עיר / אזור"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>

          {/* Salary / Price */}
          {showSalary && (
            <div>
              <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">שכר</label>
              <input
                type="text"
                value={form.salary}
                onChange={e => setForm(prev => ({ ...prev, salary: e.target.value }))}
                placeholder="טווח שכר או תעריף"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
          )}
          {showPrice && (
            <div>
              <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">מחיר</label>
              <input
                type="text"
                value={form.price}
                onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
                placeholder="מחיר ב-₪"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">תגיות</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="הוסף תגית..."
                className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 rounded-lg bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-sm font-bold"
              >
                <Tag className="w-4 h-4" />
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-bold text-[var(--theme-text)] mb-1.5">תמונה</label>
            {previewImage ? (
              <div className="relative">
                <img src={previewImage} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => { setPreviewImage(null); setForm(prev => ({ ...prev, image: null })); }}
                  className="absolute top-2 left-2 p-1 rounded-full bg-black/50 text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-6 rounded-lg border-2 border-dashed text-center transition-all hover:border-[var(--theme-accent)]"
                style={{ borderColor: 'var(--theme-border)' }}
              >
                <ImageIcon className="w-8 h-8 mx-auto text-[var(--theme-text-secondary)] mb-1" />
                <p className="text-sm text-[var(--theme-text-secondary)]">לחץ להעלאת תמונה</p>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>
        </div>

        {/* Submit */}
        <div className="p-4 border-t border-[var(--theme-border)]">
          <button
            type="submit"
            disabled={submitting || !form.title.trim() || !form.description.trim()}
            className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold hover:shadow-lg transition-all disabled:opacity-30"
          >
            {submitting ? 'מפרסם...' : 'פרסם'}
          </button>
        </div>
      </form>
    </div>
  );
}
