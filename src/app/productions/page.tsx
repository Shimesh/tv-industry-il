'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { parseProductionFile } from '@/lib/productionParser';
import { useNotifications } from '@/contexts/NotificationContext';
import { getGoogleAuthToken, createCalendarEvent } from '@/lib/googleCalendar';
import { contacts } from '@/data/contacts';
import {
  Production, CrewAssignment, ParsedProduction,
  statusLabels, statusColors, roleDepartmentMap,
} from '@/data/productions';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Calendar, Clock, MapPin, Users, FileSpreadsheet,
  ChevronRight, ChevronLeft, Plus, Trash2, Edit3, X, Check,
  AlertCircle, Loader2, UserPlus, Phone, Building2,
  RefreshCw, Filter, Eye, Search, Sparkles, CalendarPlus,
  ExternalLink, Wand2
} from 'lucide-react';

/* ===== Helper: generate unique ID ===== */
function generateId(): string {
  return `prod_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ===== Helper: format date for display ===== */
function formatDateHe(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ===== Helper: get week dates ===== */
function getWeekDates(baseDate: Date): string[] {
  const dates: string[] = [];
  const day = baseDate.getDay(); // 0=Sun
  const start = new Date(baseDate);
  start.setDate(start.getDate() - day); // Start from Sunday
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

/* ===== Helper: get month dates ===== */
function getMonthDates(year: number, month: number): string[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: string[][] = [];
  let currentWeek: string[] = [];

  // Pad start of month
  const startPad = firstDay.getDay();
  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, 1 - startPad + i);
    currentWeek.push(d.toISOString().split('T')[0]);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(year, month, day);
    currentWeek.push(d.toISOString().split('T')[0]);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Pad end of month
  if (currentWeek.length > 0) {
    let nextDay = 1;
    while (currentWeek.length < 7) {
      const d = new Date(year, month + 1, nextDay++);
      currentWeek.push(d.toISOString().split('T')[0]);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/* ===== Main Component ===== */
export default function ProductionsPage() {
  const { user, profile } = useAuth();
  const { addNotification } = useNotifications();
  const [productions, setProductions] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>('');
  const [gcalSyncing, setGcalSyncing] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [view, setView] = useState<'week' | 'month' | 'list'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedProduction, setSelectedProduction] = useState<Production | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split('T')[0];

  /* ===== Real-time Firestore listener ===== */
  useEffect(() => {
    const q = query(collection(db, 'productions'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Production[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Production[];
      setProductions(prods);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to productions:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /* ===== AI-Powered File Parse ===== */
  const parseWithAI = useCallback(async (file: File): Promise<ParsedProduction[]> => {
    setAiStatus('קורא את הקובץ...');

    // Read file content as text for AI
    const reader = new FileReader();
    const textContent = await new Promise<string>((resolve, reject) => {
      reader.onload = (e) => {
        const data = e.target?.result;
        if (!data) { reject(new Error('Failed to read')); return; }
        // Try to convert to text using xlsx
        const XLSX = require('xlsx');
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        resolve(csv);
      };
      reader.onerror = () => reject(new Error('Read error'));
      reader.readAsArrayBuffer(file);
    });

    setAiStatus('מנתח עם AI...');

    const response = await fetch('/api/productions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: textContent, fileName: file.name }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'שגיאה בפרסור AI');

    setAiStatus('');
    return (result.productions || []).map((p: ParsedProduction) => ({
      name: p.name || '',
      date: p.date || '',
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      location: p.location || '',
      studio: p.studio || '',
      notes: p.notes || '',
      crew: (p.crew || []).map(c => ({ ...c, confirmed: false })),
    }));
  }, []);

  /* ===== File Upload Handler ===== */
  const handleFileUpload = useCallback(async (file: File) => {
    if (!user) {
      setUploadMessage({ type: 'error', text: 'יש להתחבר כדי להעלות קבצים' });
      return;
    }

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const isValid = validTypes.includes(file.type) ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.csv');

    if (!isValid) {
      setUploadMessage({ type: 'error', text: 'יש להעלות קובץ Excel (.xlsx, .xls) או CSV בלבד' });
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      // Use AI parser or standard parser
      let parsed: ParsedProduction[];
      if (useAI) {
        parsed = await parseWithAI(file);
      } else {
        parsed = await parseProductionFile(file);
      }

      if (parsed.length === 0) {
        setUploadMessage({ type: 'error', text: 'לא נמצאו הפקות בקובץ. ודאו שהעמודות כוללות לפחות: שם הפקה, תאריך' });
        setUploading(false);
        return;
      }

      // Save each production to Firestore
      let savedCount = 0;
      for (const prod of parsed) {
        const id = generateId();
        const production: Omit<Production, 'id'> = {
          name: prod.name,
          date: prod.date,
          startTime: prod.startTime,
          endTime: prod.endTime,
          location: prod.location,
          studio: prod.studio,
          notes: prod.notes,
          status: 'scheduled',
          crew: prod.crew,
          createdBy: user.uid,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sourceFile: file.name,
        };
        await setDoc(doc(db, 'productions', id), production);
        savedCount++;
      }

      // Send notification about upload
      await addNotification({
        type: 'file_upload',
        title: 'קובץ הפקות נטען',
        message: `${savedCount} הפקות נטענו מ-"${file.name}"${useAI ? ' (AI)' : ''}`,
      });

      setUploadMessage({
        type: 'success',
        text: `נטענו ${savedCount} הפקות בהצלחה מהקובץ "${file.name}"${useAI ? ' (פרסור AI)' : ''}`,
      });
    } catch (err) {
      setUploadMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'שגיאה בטעינת הקובץ',
      });
    } finally {
      setUploading(false);
      setAiStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [user, useAI, parseWithAI, addNotification]);

  /* ===== Google Calendar Sync ===== */
  const syncToGoogleCalendar = useCallback(async (production: Production) => {
    setGcalSyncing(production.id);
    try {
      const token = await getGoogleAuthToken();
      if (!token) {
        setUploadMessage({ type: 'error', text: 'לא ניתן להתחבר ל-Google Calendar' });
        return;
      }

      const result = await createCalendarEvent(token, production);
      if (result.success) {
        // Save Google Calendar event ID to production
        await updateDoc(doc(db, 'productions', production.id), {
          googleCalendarEventId: result.eventId,
          googleCalendarUrl: result.eventUrl,
          updatedAt: Date.now(),
        });
        setUploadMessage({ type: 'success', text: `ההפקה "${production.name}" סונכרנה ל-Google Calendar` });

        await addNotification({
          type: 'general',
          title: 'סנכרון Google Calendar',
          message: `"${production.name}" נוספה ליומן Google`,
          productionId: production.id,
          productionName: production.name,
        });
      } else {
        setUploadMessage({ type: 'error', text: result.error || 'שגיאה בסנכרון' });
      }
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'שגיאה בסנכרון ל-Google Calendar' });
    } finally {
      setGcalSyncing(null);
    }
  }, [addNotification]);

  /* ===== Drag & Drop ===== */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  /* ===== Production CRUD ===== */
  const updateProduction = async (id: string, data: Partial<Production>) => {
    await updateDoc(doc(db, 'productions', id), {
      ...data,
      updatedAt: Date.now(),
    });
  };

  const deleteProduction = async (id: string) => {
    await deleteDoc(doc(db, 'productions', id));
    if (selectedProduction?.id === id) setSelectedProduction(null);
  };

  const addManualProduction = async (prod: ParsedProduction) => {
    if (!user) return;
    const id = generateId();
    const production: Omit<Production, 'id'> = {
      name: prod.name,
      date: prod.date,
      startTime: prod.startTime,
      endTime: prod.endTime,
      location: prod.location,
      studio: prod.studio,
      notes: prod.notes,
      status: 'scheduled',
      crew: prod.crew,
      createdBy: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, 'productions', id), production);
    setShowAddModal(false);
  };

  /* ===== Navigation ===== */
  const goToday = () => setCurrentDate(new Date());

  const goPrev = () => {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const goNext = () => {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  /* ===== Filtered productions ===== */
  const filteredProductions = productions.filter(p => {
    if (!filterSearch) return true;
    const search = filterSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(search) ||
      p.location?.toLowerCase().includes(search) ||
      p.studio?.toLowerCase().includes(search) ||
      p.crew.some(c => c.name.toLowerCase().includes(search))
    );
  });

  const getProductionsForDate = (date: string) =>
    filteredProductions.filter(p => p.date === date);

  /* ===== Render ===== */
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center p-8 rounded-2xl border" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
          <Calendar className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--theme-accent)' }} />
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--theme-text)' }}>לוח הפקות</h2>
          <p style={{ color: 'var(--theme-text-secondary)' }}>יש להתחבר כדי לגשת ללוח ההפקות</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--theme-text)' }}>
          לוח הפקות
        </h1>
        <p style={{ color: 'var(--theme-text-secondary)' }}>
          ניהול ושיבוץ צוותי הפקה | {productions.length} הפקות רשומות
        </p>
      </div>

      {/* Upload Zone */}
      <div
        className={`mb-6 p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
          dragOver ? 'scale-[1.01]' : ''
        }`}
        style={{
          background: dragOver ? 'var(--theme-accent-glow)' : 'var(--theme-bg-secondary)',
          borderColor: dragOver ? 'var(--theme-accent)' : 'var(--theme-border)',
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right">
          {uploading ? (
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: 'var(--theme-accent)' }} />
              {aiStatus && <p className="text-xs mt-2" style={{ color: 'var(--theme-accent)' }}>{aiStatus}</p>}
            </div>
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'var(--theme-accent-glow)' }}>
              {useAI ? <Wand2 className="w-7 h-7" style={{ color: 'var(--theme-accent)' }} /> : <Upload className="w-7 h-7" style={{ color: 'var(--theme-accent)' }} />}
            </div>
          )}
          <div className="flex-1">
            <p className="font-bold text-lg" style={{ color: 'var(--theme-text)' }}>
              {uploading ? (useAI ? 'מנתח עם AI...' : 'טוען הפקות...') : 'העלאת קובץ הפקות'}
            </p>
            <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              {useAI
                ? 'מצב AI: גררו כל קובץ - ה-AI יזהה אוטומטית את המבנה גם בפורמטים לא סטנדרטיים'
                : 'גררו קובץ Excel או CSV לכאן, או לחצו לבחירת קובץ. המערכת תזהה אוטומטית את העמודות ותשבץ את הצוות'
              }
            </p>
          </div>
          <div className="flex flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--theme-text-secondary)' }} />
              <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>.xlsx .xls .csv</span>
            </div>
            {/* AI Toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); setUseAI(!useAI); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                useAI ? 'text-white shadow-lg shadow-purple-500/20' : ''
              }`}
              style={{
                background: useAI
                  ? 'linear-gradient(135deg, #7c3aed, #3b82f6)'
                  : 'var(--theme-bg)',
                color: useAI ? '#fff' : 'var(--theme-text-secondary)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {useAI ? 'AI פעיל' : 'הפעל AI'}
            </button>
          </div>
        </div>
      </div>

      {/* Upload Message */}
      <AnimatePresence>
        {uploadMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${
              uploadMessage.type === 'success' ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
            }`}
          >
            {uploadMessage.type === 'success' ? (
              <Check className="w-5 h-5 text-green-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className={uploadMessage.type === 'success' ? 'text-green-300' : 'text-red-300'}>
              {uploadMessage.text}
            </span>
            <button onClick={() => setUploadMessage(null)} className="mr-auto">
              <X className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* View Toggle */}
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--theme-border)' }}>
          {(['week', 'month', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-4 py-2 text-sm font-medium transition-all"
              style={{
                background: view === v ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)',
                color: view === v ? '#fff' : 'var(--theme-text-secondary)',
              }}
            >
              {v === 'week' ? 'שבוע' : v === 'month' ? 'חודש' : 'רשימה'}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="p-2 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-all" style={{ color: 'var(--theme-text-secondary)' }}>
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:bg-[var(--theme-accent-glow)]" style={{ color: 'var(--theme-text)' }}>
            היום
          </button>
          <button onClick={goNext} className="p-2 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-all" style={{ color: 'var(--theme-text-secondary)' }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Current period label */}
        <span className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>
          {view === 'week'
            ? (() => {
                const dates = getWeekDates(currentDate);
                return `${formatDateHe(dates[0])} - ${formatDateHe(dates[6])}`;
              })()
            : `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
          }
        </span>

        {/* Search */}
        <div className="mr-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
            <input
              type="text"
              placeholder="חיפוש הפקה..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="pr-9 pl-4 py-2 rounded-xl text-sm border outline-none transition-all focus:ring-2"
              style={{
                background: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text)',
                // @ts-expect-error CSS custom property
                '--tw-ring-color': 'var(--theme-accent)',
              }}
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all bg-gradient-to-l from-purple-500 to-blue-600 hover:shadow-lg hover:shadow-purple-500/20"
          >
            <Plus className="w-4 h-4" />
            הפקה חדשה
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--theme-accent)' }} />
        </div>
      ) : (
        <>
          {/* Week View */}
          {view === 'week' && (
            <WeekView
              dates={getWeekDates(currentDate)}
              getProductions={getProductionsForDate}
              today={today}
              onSelect={setSelectedProduction}
              onStatusChange={updateProduction}
              onDelete={deleteProduction}
            />
          )}

          {/* Month View */}
          {view === 'month' && (
            <MonthView
              weeks={getMonthDates(currentDate.getFullYear(), currentDate.getMonth())}
              currentMonth={currentDate.getMonth()}
              getProductions={getProductionsForDate}
              today={today}
              onSelect={setSelectedProduction}
            />
          )}

          {/* List View */}
          {view === 'list' && (
            <ListView
              productions={filteredProductions}
              today={today}
              onSelect={setSelectedProduction}
              onStatusChange={updateProduction}
              onDelete={deleteProduction}
            />
          )}
        </>
      )}

      {/* Production Detail Modal */}
      <AnimatePresence>
        {selectedProduction && (
          <ProductionDetailModal
            production={selectedProduction}
            onClose={() => setSelectedProduction(null)}
            onUpdate={updateProduction}
            onDelete={deleteProduction}
            onSyncGCal={syncToGoogleCalendar}
            gcalSyncing={gcalSyncing}
          />
        )}
      </AnimatePresence>

      {/* Add Production Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddProductionModal
            onClose={() => setShowAddModal(false)}
            onAdd={addManualProduction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ===== Week View ===== */
function WeekView({
  dates,
  getProductions,
  today,
  onSelect,
  onStatusChange,
  onDelete,
}: {
  dates: string[];
  getProductions: (date: string) => Production[];
  today: string;
  onSelect: (p: Production) => void;
  onStatusChange: (id: string, data: Partial<Production>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {dates.map((date, i) => {
        const prods = getProductions(date);
        const isToday = date === today;
        const d = new Date(date + 'T00:00:00');

        return (
          <div key={date} className="min-h-[200px]">
            {/* Day header */}
            <div className={`text-center py-2 rounded-t-xl text-sm font-bold ${isToday ? 'text-white' : ''}`}
              style={{
                background: isToday ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)',
                color: isToday ? '#fff' : 'var(--theme-text)',
              }}
            >
              <div>{dayNames[d.getDay()]}</div>
              <div className="text-xs opacity-70">{d.getDate()}/{d.getMonth() + 1}</div>
            </div>

            {/* Productions */}
            <div className="space-y-1 p-1 rounded-b-xl min-h-[160px] border border-t-0" style={{
              background: 'var(--theme-bg)',
              borderColor: 'var(--theme-border)',
            }}>
              {prods.length === 0 ? (
                <div className="text-center py-6 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                  אין הפקות
                </div>
              ) : (
                prods.map(prod => (
                  <motion.div
                    key={prod.id}
                    layoutId={prod.id}
                    onClick={() => onSelect(prod)}
                    className="p-2 rounded-lg cursor-pointer transition-all hover:scale-[1.02] border-r-4"
                    style={{
                      background: 'var(--theme-bg-secondary)',
                      borderRightColor: statusColors[prod.status],
                    }}
                  >
                    <div className="text-xs font-bold truncate" style={{ color: 'var(--theme-text)' }}>
                      {prod.name}
                    </div>
                    {(prod.startTime || prod.endTime) && (
                      <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                        <Clock className="w-3 h-3" />
                        <span dir="ltr">{prod.startTime}{prod.endTime ? ` - ${prod.endTime}` : ''}</span>
                      </div>
                    )}
                    {prod.crew.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                        <Users className="w-3 h-3" />
                        <span>{prod.crew.length} אנשי צוות</span>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Month View ===== */
function MonthView({
  weeks,
  currentMonth,
  getProductions,
  today,
  onSelect,
}: {
  weeks: string[][];
  currentMonth: number;
  getProductions: (date: string) => Production[];
  today: string;
  onSelect: (p: Production) => void;
}) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--theme-border)' }}>
      {/* Headers */}
      <div className="grid grid-cols-7" style={{ background: 'var(--theme-bg-secondary)' }}>
        {dayNames.map(name => (
          <div key={name} className="p-2 text-center text-sm font-bold" style={{ color: 'var(--theme-text-secondary)' }}>
            {name}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-t" style={{ borderColor: 'var(--theme-border)' }}>
          {week.map(date => {
            const d = new Date(date + 'T00:00:00');
            const isToday = date === today;
            const isCurrentMonth = d.getMonth() === currentMonth;
            const prods = getProductions(date);

            return (
              <div key={date} className="min-h-[100px] p-1.5 border-l first:border-l-0" style={{
                borderColor: 'var(--theme-border)',
                background: isToday ? 'var(--theme-accent-glow)' : 'var(--theme-bg)',
                opacity: isCurrentMonth ? 1 : 0.4,
              }}>
                <div className={`text-xs font-bold mb-1 ${isToday ? 'text-[var(--theme-accent)]' : ''}`}
                  style={{ color: isToday ? undefined : 'var(--theme-text-secondary)' }}
                >
                  {d.getDate()}
                </div>
                {prods.slice(0, 3).map(prod => (
                  <div
                    key={prod.id}
                    onClick={() => onSelect(prod)}
                    className="text-xs p-1 rounded mb-0.5 truncate cursor-pointer hover:opacity-80 transition-all"
                    style={{
                      background: statusColors[prod.status] + '20',
                      color: statusColors[prod.status],
                    }}
                  >
                    {prod.startTime && <span className="font-mono ml-1">{prod.startTime}</span>}
                    {prod.name}
                  </div>
                ))}
                {prods.length > 3 && (
                  <div className="text-xs text-center" style={{ color: 'var(--theme-text-secondary)' }}>
                    +{prods.length - 3} עוד
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ===== List View ===== */
function ListView({
  productions,
  today,
  onSelect,
  onStatusChange,
  onDelete,
}: {
  productions: Production[];
  today: string;
  onSelect: (p: Production) => void;
  onStatusChange: (id: string, data: Partial<Production>) => void;
  onDelete: (id: string) => void;
}) {
  // Group by date
  const grouped: Record<string, Production[]> = {};
  for (const p of productions) {
    const key = p.date || 'ללא תאריך';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="space-y-4">
      {sortedDates.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--theme-text-secondary)' }}>
          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-bold">אין הפקות להצגה</p>
          <p className="text-sm">העלו קובץ או הוסיפו הפקה חדשה</p>
        </div>
      ) : (
        sortedDates.map(date => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`px-3 py-1 rounded-lg text-sm font-bold ${date === today ? 'text-white' : ''}`}
                style={{
                  background: date === today ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)',
                  color: date === today ? '#fff' : 'var(--theme-text)',
                }}
              >
                {date === 'ללא תאריך' ? date : formatDateFull(date)}
              </div>
              <div className="text-xs px-2 py-0.5 rounded-full" style={{
                background: 'var(--theme-accent-glow)',
                color: 'var(--theme-accent)',
              }}>
                {grouped[date].length} הפקות
              </div>
            </div>

            <div className="space-y-2">
              {grouped[date].map(prod => (
                <motion.div
                  key={prod.id}
                  layout
                  onClick={() => onSelect(prod)}
                  className="p-4 rounded-xl border cursor-pointer transition-all hover:shadow-lg border-r-4"
                  style={{
                    background: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                    borderRightColor: statusColors[prod.status],
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>{prod.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: statusColors[prod.status] + '20', color: statusColors[prod.status] }}
                        >
                          {statusLabels[prod.status]}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                        {(prod.startTime || prod.endTime) && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span dir="ltr">{prod.startTime}{prod.endTime ? ` - ${prod.endTime}` : ''}</span>
                          </span>
                        )}
                        {prod.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {prod.location}
                          </span>
                        )}
                        {prod.studio && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {prod.studio}
                          </span>
                        )}
                        {prod.crew.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {prod.crew.length} אנשי צוות
                          </span>
                        )}
                      </div>

                      {/* Crew preview */}
                      {prod.crew.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {prod.crew.slice(0, 6).map((c, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{
                              background: 'var(--theme-accent-glow)',
                              color: 'var(--theme-text-secondary)',
                            }}>
                              {c.name} ({c.role})
                            </span>
                          ))}
                          {prod.crew.length > 6 && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{
                              background: 'var(--theme-bg)',
                              color: 'var(--theme-text-secondary)',
                            }}>
                              +{prod.crew.length - 6} נוספים
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ===== Production Detail Modal ===== */
function ProductionDetailModal({
  production,
  onClose,
  onUpdate,
  onDelete,
  onSyncGCal,
  gcalSyncing,
}: {
  production: Production;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Production>) => void;
  onDelete: (id: string) => void;
  onSyncGCal: (p: Production) => void;
  gcalSyncing: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ ...production });
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [crewSearch, setCrewSearch] = useState('');
  const [newCrewRole, setNewCrewRole] = useState('');

  const saveEdit = () => {
    onUpdate(production.id, {
      name: editData.name,
      date: editData.date,
      startTime: editData.startTime,
      endTime: editData.endTime,
      location: editData.location,
      studio: editData.studio,
      notes: editData.notes,
      status: editData.status,
    });
    setEditing(false);
  };

  const removeCrew = (index: number) => {
    const newCrew = [...production.crew];
    newCrew.splice(index, 1);
    onUpdate(production.id, { crew: newCrew });
  };

  const addCrewFromContact = (contact: typeof contacts[0], role: string) => {
    const assignment: CrewAssignment = {
      contactId: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
      role: role || contact.role,
      department: contact.department,
      phone: contact.phone,
      confirmed: false,
    };
    const newCrew = [...production.crew, assignment];
    onUpdate(production.id, { crew: newCrew });
    setShowAddCrew(false);
    setCrewSearch('');
  };

  const toggleCrewConfirmed = (index: number) => {
    const newCrew = [...production.crew];
    newCrew[index] = { ...newCrew[index], confirmed: !newCrew[index].confirmed };
    onUpdate(production.id, { crew: newCrew });
  };

  const filteredContacts = contacts.filter(c => {
    if (!crewSearch) return true;
    const search = crewSearch.toLowerCase();
    return (
      c.firstName.includes(search) ||
      c.lastName.includes(search) ||
      `${c.firstName} ${c.lastName}`.includes(search) ||
      c.role.includes(search) ||
      c.department.includes(search)
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 border-b z-10" style={{
          borderColor: 'var(--theme-border)',
          background: 'var(--theme-bg-secondary)',
        }}>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: statusColors[production.status] }} />
            {editing ? (
              <input
                value={editData.name}
                onChange={e => setEditData({ ...editData, name: e.target.value })}
                className="text-xl font-bold bg-transparent border-b-2 outline-none"
                style={{ color: 'var(--theme-text)', borderColor: 'var(--theme-accent)' }}
              />
            ) : (
              <h2 className="text-xl font-bold" style={{ color: 'var(--theme-text)' }}>{production.name}</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={saveEdit} className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => { setEditing(false); setEditData({ ...production }); }} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onSyncGCal(production)}
                  disabled={gcalSyncing === production.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:shadow-md"
                  style={{ background: 'var(--theme-accent-glow)', color: 'var(--theme-accent)' }}
                  title="סנכרן ל-Google Calendar"
                >
                  {gcalSyncing === production.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CalendarPlus className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Google Calendar</span>
                </button>
                {(production as unknown as Record<string, string>).googleCalendarUrl && (
                  <a
                    href={(production as unknown as Record<string, string>).googleCalendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg hover:bg-[var(--theme-accent-glow)]"
                    style={{ color: 'var(--theme-accent)' }}
                    title="פתח ב-Google Calendar"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button onClick={() => setEditing(true)} className="p-2 rounded-lg hover:bg-[var(--theme-accent-glow)]" style={{ color: 'var(--theme-text-secondary)' }}>
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { if (confirm('למחוק את ההפקה?')) { onDelete(production.id); onClose(); } }}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-500/20"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--theme-accent-glow)]" style={{ color: 'var(--theme-text-secondary)' }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <DetailField icon={<RefreshCw className="w-4 h-4" />} label="סטטוס">
              {editing ? (
                <select
                  value={editData.status}
                  onChange={e => setEditData({ ...editData, status: e.target.value as Production['status'] })}
                  className="w-full p-1.5 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  {Object.entries(statusLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm px-2 py-0.5 rounded-full font-medium"
                  style={{ background: statusColors[production.status] + '20', color: statusColors[production.status] }}
                >
                  {statusLabels[production.status]}
                </span>
              )}
            </DetailField>

            {/* Date */}
            <DetailField icon={<Calendar className="w-4 h-4" />} label="תאריך">
              {editing ? (
                <input type="date" value={editData.date} onChange={e => setEditData({ ...editData, date: e.target.value })}
                  className="w-full p-1.5 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                />
              ) : (
                <span className="text-sm" style={{ color: 'var(--theme-text)' }}>{production.date ? formatDateFull(production.date) : '-'}</span>
              )}
            </DetailField>

            {/* Time */}
            <DetailField icon={<Clock className="w-4 h-4" />} label="שעות">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input type="time" value={editData.startTime} onChange={e => setEditData({ ...editData, startTime: e.target.value })}
                    className="flex-1 p-1.5 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                  <span style={{ color: 'var(--theme-text-secondary)' }}>-</span>
                  <input type="time" value={editData.endTime} onChange={e => setEditData({ ...editData, endTime: e.target.value })}
                    className="flex-1 p-1.5 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>
              ) : (
                <span className="text-sm" dir="ltr" style={{ color: 'var(--theme-text)' }}>
                  {production.startTime || '-'}{production.endTime ? ` - ${production.endTime}` : ''}
                </span>
              )}
            </DetailField>

            {/* Location */}
            <DetailField icon={<MapPin className="w-4 h-4" />} label="מיקום">
              {editing ? (
                <input value={editData.location} onChange={e => setEditData({ ...editData, location: e.target.value })}
                  className="w-full p-1.5 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                />
              ) : (
                <span className="text-sm" style={{ color: 'var(--theme-text)' }}>{production.location || '-'}</span>
              )}
            </DetailField>

            {/* Studio */}
            <DetailField icon={<Building2 className="w-4 h-4" />} label="אולפן">
              {editing ? (
                <input value={editData.studio} onChange={e => setEditData({ ...editData, studio: e.target.value })}
                  className="w-full p-1.5 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                />
              ) : (
                <span className="text-sm" style={{ color: 'var(--theme-text)' }}>{production.studio || '-'}</span>
              )}
            </DetailField>
          </div>

          {/* Notes */}
          {(editing || production.notes) && (
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>הערות</label>
              {editing ? (
                <textarea value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })}
                  rows={3}
                  className="w-full p-2 rounded-lg text-sm border outline-none resize-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                />
              ) : (
                <p className="text-sm" style={{ color: 'var(--theme-text)' }}>{production.notes}</p>
              )}
            </div>
          )}

          {/* Crew Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
                <Users className="w-5 h-5" />
                צוות הפקה ({production.crew.length})
              </h3>
              <button
                onClick={() => setShowAddCrew(!showAddCrew)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:shadow-md"
                style={{
                  background: 'var(--theme-accent-glow)',
                  color: 'var(--theme-accent)',
                }}
              >
                <UserPlus className="w-4 h-4" />
                הוסף איש צוות
              </button>
            </div>

            {/* Add crew panel */}
            <AnimatePresence>
              {showAddCrew && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-3"
                >
                  <div className="p-3 rounded-xl border" style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}>
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
                        <input
                          type="text"
                          placeholder="חיפוש לפי שם, תפקיד..."
                          value={crewSearch}
                          onChange={e => setCrewSearch(e.target.value)}
                          className="w-full pr-9 pl-4 py-2 rounded-lg text-sm border outline-none"
                          style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="תפקיד בהפקה"
                        value={newCrewRole}
                        onChange={e => setNewCrewRole(e.target.value)}
                        className="w-32 px-3 py-2 rounded-lg text-sm border outline-none"
                        style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredContacts.slice(0, 20).map(contact => (
                        <button
                          key={contact.id}
                          onClick={() => addCrewFromContact(contact, newCrewRole)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-all hover:bg-[var(--theme-accent-glow)] text-right"
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{
                            background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                          }}>
                            {contact.firstName[0]}{contact.lastName[0]}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium" style={{ color: 'var(--theme-text)' }}>
                              {contact.firstName} {contact.lastName}
                            </span>
                            <span className="text-xs mr-2" style={{ color: 'var(--theme-text-secondary)' }}>
                              {contact.role} | {contact.department}
                            </span>
                          </div>
                          <Plus className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Crew list */}
            {production.crew.length === 0 ? (
              <div className="text-center py-6 text-sm rounded-xl border" style={{
                color: 'var(--theme-text-secondary)',
                borderColor: 'var(--theme-border)',
                background: 'var(--theme-bg)',
              }}>
                לא שובצו אנשי צוות להפקה זו
              </div>
            ) : (
              <div className="space-y-1.5">
                {production.crew.map((member, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                    style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{
                      background: member.confirmed
                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                        : 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                    }}>
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: 'var(--theme-text)' }}>
                        {member.name}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                        {member.role}{member.department ? ` | ${member.department}` : ''}
                      </div>
                    </div>
                    {member.phone && (
                      <a href={`tel:${member.phone}`} className="p-1.5 rounded-lg hover:bg-[var(--theme-accent-glow)]" style={{ color: 'var(--theme-text-secondary)' }}>
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => toggleCrewConfirmed(i)}
                      className={`p-1.5 rounded-lg text-xs font-medium ${
                        member.confirmed
                          ? 'bg-green-500/20 text-green-400'
                          : 'hover:bg-[var(--theme-accent-glow)]'
                      }`}
                      style={member.confirmed ? undefined : { color: 'var(--theme-text-secondary)' }}
                      title={member.confirmed ? 'מאושר' : 'ממתין לאישור'}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeCrew(i)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Source file info */}
          {production.sourceFile && (
            <div className="text-xs pt-2 border-t" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
              <FileSpreadsheet className="w-3 h-3 inline ml-1" />
              נטען מקובץ: {production.sourceFile}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ===== Detail Field ===== */
function DetailField({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: 'var(--theme-bg)' }}>
      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold" style={{ color: 'var(--theme-text-secondary)' }}>
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

/* ===== Add Production Modal ===== */
function AddProductionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (prod: ParsedProduction) => void;
}) {
  const [form, setForm] = useState<ParsedProduction>({
    name: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    location: '',
    studio: '',
    notes: '',
    crew: [],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onAdd(form);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border shadow-2xl"
        style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>הפקה חדשה</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--theme-accent-glow)]" style={{ color: 'var(--theme-text-secondary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <InputField label="שם ההפקה" required>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full p-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              placeholder="לדוגמה: חדשות 12 - מהדורת ערב"
              required
            />
          </InputField>

          <InputField label="תאריך" required>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              className="w-full p-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              required
            />
          </InputField>

          <div className="grid grid-cols-2 gap-3">
            <InputField label="שעת התחלה">
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm({ ...form, startTime: e.target.value })}
                className="w-full p-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </InputField>
            <InputField label="שעת סיום">
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm({ ...form, endTime: e.target.value })}
                className="w-full p-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </InputField>
          </div>

          <InputField label="מיקום">
            <input
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              className="w-full p-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              placeholder="כתובת או מיקום"
            />
          </InputField>

          <InputField label="אולפן">
            <input
              value={form.studio}
              onChange={e => setForm({ ...form, studio: e.target.value })}
              className="w-full p-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              placeholder="שם האולפן"
            />
          </InputField>

          <InputField label="הערות">
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full p-2 rounded-lg text-sm border outline-none resize-none"
              style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
            />
          </InputField>

          <button
            type="submit"
            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-l from-purple-500 to-blue-600 hover:shadow-lg hover:shadow-purple-500/20 transition-all"
          >
            הוסף הפקה
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function InputField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
