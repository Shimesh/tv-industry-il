'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Smile, X, Image as ImageIcon, File, Mic } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { Message } from './MessageBubble';

interface MessageInputProps {
  onSend: (text: string, type?: 'text' | 'image' | 'file', file?: File) => void;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, replyTo, onCancelReply, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, 'text');
    setText('');
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;
    onSend(file.name, type, file);
    setShowAttach(false);
    if (e.target) e.target.value = '';
  };

  const handleEmojiSelect = (emoji: string) => {
    setText(prev => prev + emoji);
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-[var(--theme-border)]" style={{ background: 'var(--theme-bg-secondary)' }}>
      {/* Reply Preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--theme-border)]" style={{ background: 'var(--theme-bg)' }}>
          <div className="flex-1 pr-3 border-r-2 border-[var(--theme-accent)]">
            <p className="text-xs font-bold text-[var(--theme-accent)]">{replyTo.senderName}</p>
            <p className="text-xs text-[var(--theme-text-secondary)] truncate">{replyTo.text}</p>
          </div>
          <button onClick={onCancelReply} className="p-1 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-all">
            <X className="w-4 h-4 text-[var(--theme-text-secondary)]" />
          </button>
        </div>
      )}

      {/* Emoji Picker */}
      {showEmoji && (
        <div className="border-b border-[var(--theme-border)]">
          <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-end gap-2 p-3">
        {/* Attach Button */}
        <div className="relative">
          <button
            onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); }}
            className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent-glow)] transition-all"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {showAttach && (
            <div
              className="absolute bottom-full mb-2 right-0 w-44 rounded-xl border shadow-xl p-2 z-50"
              style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
            >
              <button
                onClick={() => imageInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all"
              >
                <ImageIcon className="w-4 h-4 text-blue-400" />
                תמונה
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all"
              >
                <File className="w-4 h-4 text-green-400" />
                קובץ
              </button>
              <button
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all"
              >
                <Mic className="w-4 h-4 text-red-400" />
                הודעה קולית
              </button>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        <input ref={imageInputRef} type="file" accept="image/*" onChange={e => handleFileUpload(e, 'image')} className="hidden" />
        <input ref={fileInputRef} type="file" onChange={e => handleFileUpload(e, 'file')} className="hidden" />

        {/* Emoji Button */}
        <button
          onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }}
          className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent-glow)] transition-all"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="הקלד הודעה..."
          disabled={disabled}
          rows={1}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none resize-none max-h-32 transition-colors"
          style={{
            background: 'var(--theme-bg)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text)',
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 128) + 'px';
          }}
        />

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="p-2.5 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
