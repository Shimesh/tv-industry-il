'use client';

import { useState } from 'react';

/**
 * Cinematic hero collage.
 *
 * Place TV-production stock photos in /public/hero/1.jpg … 5.jpg.
 * Until they exist the component shows a vivid CSS-only version.
 */

const SLOTS = [
  { src: '/hero/1.jpg', className: 'col-span-2 row-span-2', label: 'בשידור חי' },
  { src: '/hero/2.jpg', className: 'col-span-1 row-span-1', label: null },
  { src: '/hero/3.jpg', className: 'col-span-1 row-span-1', label: null },
  { src: '/hero/4.jpg', className: 'col-span-1 row-span-1', label: null },
  { src: '/hero/5.jpg', className: 'col-span-1 row-span-1', label: null },
];

const CSS_COLORS = [
  'linear-gradient(135deg,#1e3a8a,#1e6fd9)',
  'linear-gradient(135deg,#78350f,#f5c518)',
  'linear-gradient(135deg,#064e3b,#0ea5a4)',
  'linear-gradient(135deg,#7c0000,#ef3b2c)',
  'linear-gradient(135deg,#0c4a6e,#0bc1d4)',
];

function Slot({ src, idx, colSpan, rowSpan, label }: {
  src: string; idx: number; colSpan: string; rowSpan: string; label: string | null;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${colSpan} ${rowSpan}`}
      style={{ minHeight: rowSpan.includes('2') ? '220px' : '105px' }}
    >
      {/* CSS fallback background */}
      <div className="absolute inset-0" style={{ background: CSS_COLORS[idx % CSS_COLORS.length] }} />

      {/* Real image (if provided) */}
      {!failed && (
        <img
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}

      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(8,8,30,0.75) 0%, rgba(8,8,30,0.20) 55%, transparent 100%)',
        }}
      />

      {/* ON AIR badge on first slot */}
      {idx === 0 && (
        <div
          className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black text-white"
          style={{ background: 'rgba(239,68,68,0.92)', backdropFilter: 'blur(8px)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white pulse-live" />
          ON AIR
        </div>
      )}

      {label && (
        <div className="absolute bottom-2 right-2 text-[10px] font-bold text-white/60">{label}</div>
      )}
    </div>
  );
}

export default function HeroCinematicCollage() {
  return (
    <div className="relative select-none w-full max-w-[500px] mx-auto lg:mx-0">
      {/* Ambient purple glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: '-40px',
          background:
            'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(157,78,221,0.30) 0%, transparent 70%)',
          filter: 'blur(28px)',
        }}
      />

      {/* Fake browser chrome */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          border: '1px solid rgba(157,78,221,0.32)',
          boxShadow:
            '0 0 0 1px rgba(0,240,255,0.08), 0 36px 80px rgba(0,0,0,0.65)',
          background: '#0a0a1e',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-1.5 px-3 py-2.5"
          style={{
            background: 'rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <div
            className="mr-3 flex-1 rounded-full px-3 py-0.5 text-center text-[10px]"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.30)' }}
          >
            tv-industry-il.vercel.app
          </div>
        </div>

        {/* Mosaic grid */}
        <div
          className="p-2"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '3px',
          }}
        >
          <Slot src={SLOTS[0].src} idx={0} colSpan="col-span-1 [grid-column:1/2]" rowSpan="[grid-row:1/3]" label={SLOTS[0].label} />
          <Slot src={SLOTS[1].src} idx={1} colSpan="" rowSpan="" label={null} />
          <Slot src={SLOTS[2].src} idx={2} colSpan="" rowSpan="" label={null} />
          <Slot src={SLOTS[3].src} idx={3} colSpan="" rowSpan="" label={null} />
          <Slot src={SLOTS[4].src} idx={4} colSpan="" rowSpan="" label={null} />
        </div>

        {/* Inner tint */}
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            background:
              'linear-gradient(135deg, rgba(157,78,221,0.07) 0%, transparent 50%, rgba(0,240,255,0.04) 100%)',
          }}
        />
      </div>

      {/* Floating "live" badge */}
      <div
        className="absolute -bottom-5 -right-4 flex items-center gap-2.5 rounded-2xl px-4 py-2.5"
        style={{
          background: 'rgba(10,10,25,0.96)',
          border: '1px solid rgba(0,240,255,0.24)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        <div>
          <div className="text-[10px] font-bold" style={{ color: '#00f0ff' }}>שידור חי</div>
          <div className="text-white font-black text-sm leading-none">7 ערוצים פעילים</div>
        </div>
      </div>
    </div>
  );
}
