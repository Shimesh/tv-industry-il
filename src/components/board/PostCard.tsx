'use client';

import Link from 'next/link';
import UserAvatar from '@/components/UserAvatar';
import {
  Briefcase, Search, Package, Gift, MapPin, Clock, MessageCircle,
  Eye, Heart, Share2, Tag
} from 'lucide-react';
import { useState } from 'react';

export interface Post {
  id: string;
  type: 'job_offer' | 'job_search' | 'equipment_sale' | 'equipment_free';
  title: string;
  description: string;
  category: string;
  location?: string;
  salary?: string;
  price?: string;
  imageURL?: string | null;
  tags: string[];
  authorId: string;
  authorName: string;
  authorPhoto?: string | null;
  authorRole?: string;
  views: number;
  likes: number;
  comments: number;
  createdAt: number;
  isActive: boolean;
}

interface PostCardProps {
  post: Post;
  onLike?: () => void;
  onContact?: () => void;
  onComments?: () => void;
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  job_offer: { label: 'הצעת עבודה', icon: Briefcase, color: 'text-green-400', bg: 'bg-green-500/10' },
  job_search: { label: 'חיפוש עבודה', icon: Search, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  equipment_sale: { label: 'ציוד למכירה', icon: Package, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  equipment_free: { label: 'ציוד למסירה', icon: Gift, color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

export default function PostCard({ post, onLike, onContact, onComments }: PostCardProps) {
  const config = typeConfig[post.type] || typeConfig.job_offer;
  const TypeIcon = config.icon;
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = `${post.title}\n${post.description}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, text });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `לפני ${minutes} דקות`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `לפני ${hours} שעות`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `לפני ${days} ימים`;
    return new Date(timestamp).toLocaleDateString('he-IL');
  };

  return (
    <div className="rounded-xl border overflow-hidden transition-all hover:shadow-lg card-glow" style={{
      background: 'var(--theme-bg-card)',
      borderColor: 'var(--theme-border)',
    }}>
      {/* Image */}
      {post.imageURL && (
        <div className="aspect-video relative overflow-hidden">
          <img src={post.imageURL} alt={post.title} className="w-full h-full object-cover" />
          <div className="absolute top-3 right-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${config.color} ${config.bg} backdrop-blur-sm`}>
              <TypeIcon className="w-3 h-3 inline ml-1" />
              {config.label}
            </span>
          </div>
        </div>
      )}

      <div className="p-4">
        {/* Type badge (if no image) */}
        {!post.imageURL && (
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${config.color} ${config.bg}`}>
              <TypeIcon className="w-3 h-3 inline ml-1" />
              {config.label}
            </span>
            {post.category && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)]">
                {post.category}
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <h3 className="text-base font-bold text-[var(--theme-text)] mb-1.5 line-clamp-2">{post.title}</h3>

        {/* Description */}
        <p className="text-sm text-[var(--theme-text-secondary)] line-clamp-2 mb-3">{post.description}</p>

        {/* Meta info */}
        <div className="flex flex-wrap gap-2 mb-3">
          {post.location && (
            <span className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)]">
              <MapPin className="w-3 h-3" />
              {post.location}
            </span>
          )}
          {post.salary && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              ₪ {post.salary}
            </span>
          )}
          {post.price && (
            <span className="flex items-center gap-1 text-xs text-orange-400">
              ₪{post.price}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)]">
            <Clock className="w-3 h-3" />
            {formatTime(post.createdAt)}
          </span>
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {post.tags.slice(0, 4).map(tag => (
              <span key={tag} className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]">
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-[var(--theme-border)] pt-3 mt-1" />

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Author */}
          <div className="flex items-center gap-2">
            <UserAvatar name={post.authorName} photoURL={post.authorPhoto} size="sm" />
            <div>
              <p className="text-xs font-bold text-[var(--theme-text)]">{post.authorName}</p>
              {post.authorRole && (
                <p className="text-[10px] text-[var(--theme-text-secondary)]">{post.authorRole}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onLike}
              className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-red-400 transition-all"
            >
              <Heart className="w-3.5 h-3.5" />
              {post.likes > 0 && post.likes}
            </button>
            <button
              onClick={onComments}
              className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-blue-400 transition-all"
              title="הצג תגובות"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {post.comments > 0 && post.comments}
            </button>
            <span className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)]">
              <Eye className="w-3.5 h-3.5" />
              {post.views}
            </span>
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-blue-400 transition-all"
              title="שתף פוסט"
            >
              <Share2 className="w-3.5 h-3.5" />
              {copied ? '✓' : ''}
            </button>
            {onContact && (
              <button
                onClick={onContact}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-white transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                צור קשר
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
