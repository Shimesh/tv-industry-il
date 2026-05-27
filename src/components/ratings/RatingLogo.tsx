'use client';

import { Tv } from 'lucide-react';
import ChannelLogo from '@/components/ChannelLogo';
import { findChannelByName } from '@/data/channels';

type ChannelBrand = {
  label: string;
  name: string;
  className: string;
};

function getChannelBrand(channel?: string): ChannelBrand | null {
  const value = (channel || '').replace(/\s+/g, ' ').trim();
  if (!value) return null;

  if (/קשת|12/.test(value)) {
    return {
      label: '12',
      name: 'קשת',
      className: 'border-red-300/30 bg-gradient-to-br from-red-500/90 to-rose-800 text-white',
    };
  }
  if (/רשת|13/.test(value)) {
    return {
      label: '13',
      name: 'רשת',
      className: 'border-emerald-300/30 bg-gradient-to-br from-emerald-500/90 to-teal-900 text-white',
    };
  }
  if (/כאן|11/.test(value)) {
    return {
      label: '11',
      name: 'כאן',
      className: 'border-sky-300/30 bg-gradient-to-br from-sky-500/90 to-blue-950 text-white',
    };
  }
  if (/14|עכשיו/.test(value)) {
    return {
      label: '14',
      name: 'עכשיו',
      className: 'border-violet-300/30 bg-gradient-to-br from-violet-500/90 to-indigo-950 text-white',
    };
  }
  if (/i24|24/.test(value)) {
    return {
      label: 'i24',
      name: 'i24',
      className: 'border-cyan-300/30 bg-gradient-to-br from-cyan-500/90 to-slate-950 text-white',
    };
  }
  if (/ספורט.?5(?!\s*(GOLD|LIVE|\+|פלוס))|(?<!\d)55(?!\d)/.test(value)) {
    return {
      label: '55',
      name: 'ספורט 5',
      className: 'border-orange-300/30 bg-gradient-to-br from-orange-500/90 to-red-900 text-white',
    };
  }

  const numericLabel = value.match(/\d{1,3}/)?.[0];
  if (numericLabel) {
    return {
      label: numericLabel,
      name: value,
      className: 'border-purple-300/30 bg-gradient-to-br from-purple-500/80 to-slate-950 text-white',
    };
  }

  return null;
}

export default function RatingLogo({
  src,
  name,
  channel,
  compact = false,
}: {
  src?: string;
  name: string;
  channel?: string;
  compact?: boolean;
}) {
  const size = compact ? 'h-8 w-8' : 'h-12 w-12';
  const channelLogo = findChannelByName(channel);

  if (channelLogo) {
    return (
      <ChannelLogo
        channel={channelLogo}
        size={compact ? 32 : 48}
        rounded={8}
        className="shadow-lg shadow-black/10"
      />
    );
  }

  const brand = getChannelBrand(channel);
  if (brand) {
    return (
      <div
        className={`${size} flex shrink-0 flex-col items-center justify-center rounded-lg border shadow-lg shadow-black/10 ${brand.className}`}
        title={brand.name}
      >
        <span className={`${compact ? 'text-xs' : 'text-base'} font-black leading-none`} dir="ltr">{brand.label}</span>
        {!compact ? <span className="mt-0.5 max-w-full truncate px-1 text-[9px] font-bold leading-none opacity-85">{brand.name}</span> : null}
      </div>
    );
  }

  if (src) {
    return (
      <div className={`${size} shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/95 p-1.5`}>
        <img src={src} alt={name} className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      </div>
    );
  }

  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-lg border border-purple-400/25 bg-purple-500/15 text-purple-100`} title={channel || name}>
      <Tv className="h-5 w-5" />
    </div>
  );
}
