'use client';

interface TypingIndicatorProps {
  names: string[];
}

export default function TypingIndicator({ names }: TypingIndicatorProps) {
  if (names.length === 0) return null;

  const text = names.length === 1
    ? `${names[0]} מקליד/ה...`
    : names.length === 2
      ? `${names[0]} ו-${names[1]} מקלידים...`
      : `${names[0]} ועוד ${names.length - 1} מקלידים...`;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <div className="flex gap-1">
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--theme-text-secondary)]" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--theme-text-secondary)]" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--theme-text-secondary)]" />
      </div>
      <span className="text-xs text-[var(--theme-text-secondary)] italic">{text}</span>
    </div>
  );
}
