'use client';

import { useState } from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const emojiCategories = [
  {
    name: 'שימושי',
    emojis: ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😜', '🤩', '😎', '🤔', '😏', '😴', '🤭', '🫡', '😅', '😢', '😤', '😡', '🥺', '😱', '🤯', '😈', '👻', '💀', '🤡', '👽', '🤖', '💩', '🎃']
  },
  {
    name: 'מחוות',
    emojis: ['👍', '👎', '👋', '🤝', '🙏', '💪', '✌️', '🤞', '🤟', '🤘', '👏', '🫶', '❤️', '🔥', '⭐', '✨', '💯', '🎉', '🎊', '🏆', '🥇', '🎯', '💎', '🌟', '⚡', '💡', '🔔', '📌', '🚀', '💫']
  },
  {
    name: 'עבודה',
    emojis: ['📷', '🎬', '🎥', '📹', '🎙️', '🎧', '📺', '📡', '💻', '🖥️', '⌨️', '📱', '☎️', '📞', '📋', '📝', '📊', '📈', '📅', '🗓️', '⏰', '⏱️', '🔧', '🔨', '⚙️', '🛠️', '📦', '📁', '📂', '🗂️']
  },
  {
    name: 'דגלים',
    emojis: ['🇮🇱', '🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇪🇸', '🇮🇹', '🇯🇵', '🇰🇷', '🇨🇳', '🇷🇺', '🇧🇷', '🇮🇳', '🇦🇺', '🇨🇦', '🏳️', '🏴', '🏁', '🚩', '🎌']
  },
];

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState('');

  const allEmojis = emojiCategories.flatMap(c => c.emojis);
  const displayEmojis = search
    ? allEmojis
    : emojiCategories[activeCategory]?.emojis || [];

  return (
    <div className="p-3 max-h-64 overflow-hidden" style={{ background: 'var(--theme-bg-secondary)' }}>
      {/* Category Tabs */}
      <div className="flex gap-1 mb-2 border-b border-[var(--theme-border)] pb-2">
        {emojiCategories.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => { setActiveCategory(i); setSearch(''); }}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
              activeCategory === i && !search
                ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div className="grid grid-cols-10 gap-0.5 max-h-40 overflow-y-auto">
        {displayEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onSelect(emoji)}
            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--theme-accent-glow)] rounded-lg transition-all hover:scale-110"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
