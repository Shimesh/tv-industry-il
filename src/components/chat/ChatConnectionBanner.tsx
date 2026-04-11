'use client';

import { AlertTriangle, Loader2, Wifi, WifiOff, ShieldCheck } from 'lucide-react';
import type { ChatConnectionState } from './chatTypes';

interface ChatConnectionBannerProps {
  enabled: boolean;
  connectionState: ChatConnectionState;
  pendingCount: number;
}

const iconByMode = {
  legacy: ShieldCheck,
  preview: ShieldCheck,
  connecting: Loader2,
  connected: Wifi,
  reconnecting: Loader2,
  offline: WifiOff,
  degraded: AlertTriangle,
} as const;

const colorByMode: Record<ChatConnectionState['mode'], string> = {
  legacy: 'border-slate-600/60 bg-slate-950/70 text-slate-200',
  preview: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  connecting: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100',
  connected: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  reconnecting: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-100',
  offline: 'border-red-500/40 bg-red-500/10 text-red-100',
  degraded: 'border-orange-500/40 bg-orange-500/10 text-orange-100',
};

export default function ChatConnectionBanner({
  enabled,
  connectionState,
  pendingCount,
}: ChatConnectionBannerProps) {
  if (!enabled && connectionState.mode === 'legacy') return null;

  const Icon = iconByMode[connectionState.mode];
  const isSpinning = connectionState.mode === 'connecting' || connectionState.mode === 'reconnecting';

  return (
    <div className={`mx-3 mt-3 rounded-2xl border px-4 py-3 shadow-sm ${colorByMode[connectionState.mode]}`} dir="rtl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Icon className={`h-4 w-4 ${isSpinning ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{connectionState.label}</span>
            {pendingCount > 0 && (
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-medium">
                {pendingCount} בהמתנה
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 opacity-90">{connectionState.detail}</p>
        </div>
      </div>
    </div>
  );
}
