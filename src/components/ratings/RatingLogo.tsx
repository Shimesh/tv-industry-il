'use client';

import { Tv } from 'lucide-react';

export default function RatingLogo({
  src,
  name,
  compact = false,
}: {
  src?: string;
  name: string;
  compact?: boolean;
}) {
  const size = compact ? 'h-10 w-10' : 'h-12 w-12';
  if (src) {
    return (
      <div className={`${size} shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/95 p-1.5`}>
        <img src={src} alt={name} className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      </div>
    );
  }

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-lg border border-purple-400/25 bg-purple-500/15 text-sm font-black text-purple-100`}>
      {initials || <Tv className="h-5 w-5" />}
    </div>
  );
}

