'use client';

import { useState, useRef, ClipboardEvent } from 'react';
import { Link2, User, Calendar, Loader2, Send, X, Clipboard, AlertTriangle } from 'lucide-react';
import { FetchProgress } from '@/lib/browserFetch';
import { isHerzliyaHTML } from '@/lib/productionScheduleParser';

interface DetectedInfo {
  url: string | null;
  workerName: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  rawText: string;
  rawHtml?: string | null;
}

interface MessageInputProps {
  onFetch: (url: string | null, manualText: string | null, rawHtml?: string | null) => Promise<void>;
  onSubmitActionRequest?: (url: string, workerName?: string | null, weekStart?: string | null, weekEnd?: string | null) => Promise<void>;
  loading: boolean;
  existingWeekId?: string | null;
  fetchProgress?: FetchProgress | null;
}

export default function MessageInput({ onFetch, onSubmitActionRequest, loading, existingWeekId, fetchProgress }: MessageInputProps) {
  const [text, setText] = useState('');
  const [detected, setDetected] = useState<DetectedInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const detectInfo = (input: string): DetectedInfo => {
    const info: DetectedInfo = {
      url: null,
      workerName: null,
      weekStart: null,
      weekEnd: null,
      rawText: input,
    };

    // Extract URL
    const urlMatch = input.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      info.url = urlMatch[0];
    }

    // Extract worker name - "שלום [Name]" pattern
    const nameMatch = input.match(/שלום\s+([^\n,]+)/);
    if (nameMatch) {
      info.workerName = nameMatch[1].trim();
    }

    // Extract dates
    const dateMatch = input.match(/(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      info.weekStart = dateMatch[1];
      info.weekEnd = dateMatch[2];
    }

    return info;
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // Try to get HTML version (available when copying from web pages)
    const pastedHtml = e.clipboardData.getData('text/html');
    const pastedText = e.clipboardData.getData('text');

    // Check if clipboard HTML is Herzliya schedule
    if (pastedHtml && isHerzliyaHTML(pastedHtml)) {
      e.preventDefault();
      const info = detectInfo(pastedText);
      info.rawHtml = pastedHtml;
      setDetected(info);
      setText(pastedText.substring(0, 200) + (pastedText.length > 200 ? '...' : ''));
      setError(null);
      return;
    }

    // Normal text handling
    if (pastedText.trim()) {
      const info = detectInfo(pastedText);
      if (info.url || info.weekStart) {
        setDetected(info);
        setText(pastedText);
        setError(null);
      }
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (value.trim().length > 10) {
      const info = detectInfo(value);
      if (info.url || info.weekStart) {
        setDetected(info);
        setError(null);
      } else {
        setDetected(null);
      }
    } else {
      setDetected(null);
    }
  };

  const handleSubmit = async () => {
    if (!detected && !text.trim()) return;
    setError(null);

    try {
      if (detected?.rawHtml) {
        // HTML from clipboard - parse directly
        await onFetch(null, null, detected.rawHtml);
      } else if (detected?.url) {
        await onFetch(detected.url, null);
      } else if (text.trim()) {
        await onFetch(null, text.trim());
      }
      setText('');
      setDetected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הלוח');
    }
  };

  const clearAll = () => {
    setText('');
    setDetected(null);
    setError(null);
  };

  // Loading step message from progress
  const loadingMessage = fetchProgress?.message || 'טוען לוח עבודה...';

  // Detected source label
  const detectedSource = detected?.rawHtml
    ? '📋 זיהיתי לוח הרצליה מהלוח'
    : detected?.url
      ? 'זיהיתי הודעת לוח עבודה'
      : 'זיהיתי תוכן לוח עבודה';

  return (
    <div className="space-y-3">
      {/* Input area */}
      <div className="relative rounded-xl border overflow-hidden transition-all" style={{
        background: 'var(--theme-bg-secondary)',
        borderColor: detected ? 'var(--theme-accent)' : 'var(--theme-border)',
        boxShadow: detected ? '0 0 20px color-mix(in srgb, var(--theme-accent) 15%, transparent)' : 'none',
      }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onPaste={handlePaste}
          placeholder="הדבק כאן הודעת WhatsApp עם לינק ללוח העבודה, או Ctrl+A Ctrl+C מדף הרצליה..."
          className="w-full min-h-[100px] p-4 text-sm resize-none bg-transparent outline-none"
          style={{ color: 'var(--theme-text)' }}
          dir="rtl"
          disabled={loading}
        />

        {text && !loading && (
          <button
            onClick={clearAll}
            className="absolute top-3 left-3 p-1.5 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-colors"
          >
            <X className="w-4 h-4 text-[var(--theme-text-secondary)]" />
          </button>
        )}
      </div>

      {/* Detection confirmation card */}
      {detected && (
        <div className="rounded-xl border p-4 animate-in slide-in-from-top-2" style={{
          background: 'var(--theme-bg-secondary)',
          borderColor: 'color-mix(in srgb, var(--theme-accent) 30%, transparent)',
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-green-400 text-sm">✓</span>
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
              {detectedSource}
            </span>
          </div>

          <div className="space-y-2 mb-4">
            {detected.workerName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-blue-400" />
                <span style={{ color: 'var(--theme-text)' }}>{detected.workerName}</span>
              </div>
            )}
            {detected.weekStart && detected.weekEnd && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span style={{ color: 'var(--theme-text)' }}>
                  {detected.weekStart} - {detected.weekEnd}
                </span>
              </div>
            )}
            {detected.url && (
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 truncate max-w-[280px]" dir="ltr">
                  {detected.url.length > 50 ? detected.url.substring(0, 50) + '...' : detected.url}
                </span>
              </div>
            )}
            {detected.rawHtml && (
              <div className="flex items-center gap-2 text-xs px-2 py-1 rounded-lg bg-green-500/10 text-green-400">
                <span>✨ זוהה HTML של לוח הרצליה - פרסינג מדויק</span>
              </div>
            )}
          </div>

          {existingWeekId && detected.weekStart && (
            <div className="flex items-center gap-2 text-xs mb-3 p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>כבר קיים לוח לשבוע זה - שינויים יזוהו אוטומטית</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 80%, #6366f1))',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{loadingMessage}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>טען לוח עבודה</span>
                </>
              )}
            </button>
            {detected?.url && onSubmitActionRequest && (
              <button
                onClick={() => onSubmitActionRequest(detected.url!, detected.workerName, detected.weekStart, detected.weekEnd)}
                disabled={loading}
                className="px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-[var(--theme-accent-glow)]"
                style={{ color: 'var(--theme-text-secondary)' }}
                title="שלח לעיבוד ברקע (GitHub Action)"
              >
                שלח ל-Action
              </button>
            )}
            <button
              onClick={clearAll}
              disabled={loading}
              className="px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-[var(--theme-accent-glow)]"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Quick paste button (when no text) */}
      {!text && !detected && !loading && (
        <button
          onClick={async () => {
            try {
              const clipText = await navigator.clipboard.readText();
              if (clipText) {
                handleTextChange(clipText);
                const info = detectInfo(clipText);
                if (info.url || info.weekStart) {
                  setDetected(info);
                }
              }
            } catch {
              textareaRef.current?.focus();
            }
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all hover:bg-[var(--theme-accent-glow)]"
          style={{
            color: 'var(--theme-text-secondary)',
            border: '1px dashed var(--theme-border)',
          }}
        >
          <Clipboard className="w-4 h-4" />
          <span>הדבק מהלוח</span>
        </button>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
