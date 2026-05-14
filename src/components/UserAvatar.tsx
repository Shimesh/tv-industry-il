'use client';

import { useState } from 'react';

interface UserAvatarProps {
  name: string;
  photoURL?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  isGhost?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
};

const dotSizeMap = {
  sm: 'w-2.5 h-2.5 border',
  md: 'w-3 h-3 border-2',
  lg: 'w-4 h-4 border-2',
  xl: 'w-5 h-5 border-2',
};

const ghostIconSizeMap = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
  xl: 'w-10 h-10',
};

export default function UserAvatar({ name, photoURL, size = 'md', isOnline, isGhost, className = '' }: UserAvatarProps) {
  const [failedPhotoURL, setFailedPhotoURL] = useState<string | null>(null);
  const imageSrc = photoURL && failedPhotoURL !== photoURL ? photoURL : undefined;
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const colors = [
    'from-purple-500 to-blue-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-red-500',
    'from-pink-500 to-purple-500',
    'from-yellow-500 to-orange-500',
    'from-indigo-500 to-purple-500',
    'from-teal-500 to-emerald-500',
  ];

  const colorIdx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;

  return (
    <div className={`relative shrink-0 ${className}`}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={name}
          className={`${sizeMap[size]} rounded-full object-cover ring-2 ring-[var(--theme-border)]`}
          referrerPolicy="no-referrer"
          onError={() => setFailedPhotoURL(imageSrc)}
        />
      ) : isGhost ? (
        <div className={`${sizeMap[size]} rounded-full bg-slate-700/80 flex items-center justify-center ring-2 ring-slate-500/40 animate-pulse`}>
          <svg
            className={`${ghostIconSizeMap[size]} text-slate-400`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9v.5L3.11 12.38A1 1 0 0 0 4 14h1v2a1 1 0 0 0 1 1h1v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2h1a1 1 0 0 0 1-1v-2h1a1 1 0 0 0 .89-1.62L19 9.5V9c0-3.87-3.13-7-7-7z" />
          </svg>
        </div>
      ) : (
        <div className={`${sizeMap[size]} rounded-full bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center font-bold text-white`}>
          {initials}
        </div>
      )}
      {isOnline !== undefined && (
        <span className={`absolute bottom-0 right-0 ${dotSizeMap[size]} rounded-full border-[var(--theme-bg)] ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
      )}
    </div>
  );
}
