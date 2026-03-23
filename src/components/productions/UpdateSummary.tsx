'use client';

import { ScheduleDiff, Change } from '@/lib/productionDiff';
import { X, Plus, Clock, XCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface UpdateSummaryProps {
  diff: ScheduleDiff;
  onDismiss: () => void;
}

const changeIcons: Record<Change['type'], { icon: typeof Plus; color: string; label: string }> = {
  ADD_PRODUCTION: { icon: Plus, color: '#4ade80', label: '➕' },
  UPDATE_TIME: { icon: Clock, color: '#fbbf24', label: '🕐' },
  ADD_CREW: { icon: Plus, color: '#60a5fa', label: '👤' },
  CANCEL_PRODUCTION: { icon: XCircle, color: '#f87171', label: '❌' },
  UPDATE_CREW: { icon: Plus, color: '#60a5fa', label: '👥' },
};

export default function UpdateSummary({ diff, onDismiss }: UpdateSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  if (!diff.hasChanges) return null;

  const previewChanges = diff.changes.slice(0, 3);
  const remainingCount = diff.changes.length - 3;

  return (
    <div className="rounded-xl border overflow-hidden animate-in slide-in-from-top-2" style={{
      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.03))',
      borderColor: 'rgba(34, 197, 94, 0.3)',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'rgba(34, 197, 94, 0.15)' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
          <span className="text-sm font-bold text-green-400">
            עודכן בהצלחה!
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">
            {diff.changes.length} שינויים
          </span>
        </div>
        <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
          <X className="w-4 h-4 text-green-400/60" />
        </button>
      </div>

      {/* Changes list */}
      <div className="p-3 space-y-1.5">
        {(expanded ? diff.changes : previewChanges).map((change, idx) => {
          const config = changeIcons[change.type];
          return (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <span className="flex-shrink-0 mt-0.5">{config.label}</span>
              <span style={{ color: 'var(--theme-text)' }}>
                {change.description}
              </span>
            </div>
          );
        })}

        {!expanded && remainingCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-green-400 hover:text-green-300 font-medium mt-1 transition-colors"
          >
            ראה עוד {remainingCount} שינויים...
          </button>
        )}

        {expanded && diff.changes.length > 3 && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-green-400 hover:text-green-300 font-medium mt-1 transition-colors"
          >
            הסתר
          </button>
        )}
      </div>
    </div>
  );
}
