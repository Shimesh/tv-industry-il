'use client';

import { Production, VersionEntry } from '@/lib/productionDiff';
import { X, History } from 'lucide-react';

interface ChangeHistoryProps {
  production: Production;
  onClose: () => void;
}

export default function ChangeHistory({ production, onClose }: ChangeHistoryProps) {
  const versions = production.versions || [];

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-md max-h-[70vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4"
        style={{
          background: 'var(--theme-bg-secondary)',
          border: '1px solid var(--theme-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
              היסטוריית שינויים
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--theme-accent-glow)] transition-colors">
            <X className="w-5 h-5" style={{ color: 'var(--theme-text-secondary)' }} />
          </button>
        </div>

        <div className="p-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <h4 className="text-sm font-bold text-red-400">{production.name}</h4>
          <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
            {production.studio} • {production.day}
          </p>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto p-4">
          {versions.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--theme-text-secondary)' }}>
              אין היסטוריית שינויים
            </p>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute right-[9px] top-2 bottom-2 w-0.5 bg-[var(--theme-border)]" />

              <div className="space-y-4">
                {[...versions].reverse().map((version, idx) => (
                  <VersionItem key={idx} version={version} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionItem({ version }: { version: VersionEntry }) {
  const date = new Date(version.timestamp);
  const timeStr = date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex gap-3 pr-0">
      {/* Timeline dot */}
      <div className="relative z-10 mt-1">
        <div className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center" style={{
          borderColor: 'var(--theme-accent)',
          background: 'var(--theme-bg-secondary)',
        }}>
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--theme-accent)' }} />
        </div>
      </div>

      <div className="flex-1 pb-2">
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
          <span className="font-bold" style={{ color: 'var(--theme-text)' }}>
            {version.changedByName}
          </span>
          <span>•</span>
          <span>{timeStr}</span>
        </div>

        <div className="mt-1 space-y-0.5">
          {version.changes.map((change, idx) => (
            <p key={idx} className="text-sm" style={{ color: 'var(--theme-text)' }}>
              {change.description}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
