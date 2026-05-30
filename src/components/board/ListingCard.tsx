'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Phone, Mail, Eye, MessageCircle, Flame, Zap,
  ChevronDown, ChevronUp, Image as ImageIcon, Tag, X
} from 'lucide-react';
import { LISTING_TYPE_CONFIG, formatPrice, type BoardListing } from '@/lib/boardTypes';
import { useAuth } from '@/contexts/AuthContext';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `לפני ${d} ${d === 1 ? 'יום' : 'ימים'}`;
  if (h > 0) return `לפני ${h} ${h === 1 ? 'שעה' : 'שעות'}`;
  const m = Math.floor(diff / 60000);
  return m > 1 ? `לפני ${m} דקות` : 'עכשיו';
}

interface Props {
  listing: BoardListing;
  onClose?: (id: string) => void;
}

export default function ListingCard({ listing, onClose }: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [contactRevealed, setContactRevealed] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const cfg = LISTING_TYPE_CONFIG[listing.type];
  const price = formatPrice(listing.price, listing.priceMax, listing.priceUnit);
  const isOwner = user?.uid === listing.authorUid;

  const handleRevealContact = () => {
    if (!contactRevealed) {
      fetch(`/api/board/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'contact' }),
      }).catch(() => {});
    }
    setContactRevealed(true);
  };

  const handleClose = async () => {
    if (!onClose || !user) return;
    const token = await user.getIdToken().catch(() => '');
    fetch(`/api/board/listings/${listing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'closed' }),
    }).then(() => onClose(listing.id)).catch(() => {});
  };

  const media = listing.mediaUrls ?? [];

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--theme-bg-card)',
          border: `1px solid ${cfg.border}`,
          borderLeftWidth: 3,
          borderLeftColor: cfg.color,
        }}
      >
        {/* Media thumbnail */}
        {media.length > 0 && (
          <div
            className="h-40 w-full bg-black cursor-pointer overflow-hidden flex-shrink-0"
            onClick={() => setLightboxIdx(0)}
          >
            {media[0].match(/\.(mp4|webm|mov)$/i) ? (
              <video src={media[0]} className="w-full h-full object-cover" muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media[0]} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
            )}
            {media.length > 1 && (
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-md px-1.5 py-0.5 text-[11px] text-white">
                <ImageIcon className="w-3 h-3" />
                {media.length}
              </div>
            )}
          </div>
        )}

        <div className="p-4 flex flex-col gap-2 flex-1">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
            >
              {cfg.label}
            </span>
            {listing.isHot && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/15 text-orange-400">
                <Flame className="w-3 h-3" /> חם
              </span>
            )}
            {listing.isUrgent && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-500/15 text-red-400">
                <Zap className="w-3 h-3" /> דחוף
              </span>
            )}
            {isOwner && onClose && (
              <button
                onClick={handleClose}
                className="mr-auto text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors"
                style={{ color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}
              >
                סגור מודעה
              </button>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-black leading-snug" style={{ color: 'var(--theme-text)' }}>
            {listing.title}
          </h3>

          {/* Price */}
          {price && (
            <div className="text-base font-black" style={{ color: cfg.color }}>
              {price}
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
            {listing.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {listing.location}
              </span>
            )}
            {listing.department && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3 flex-shrink-0" />
                {listing.department}
              </span>
            )}
          </div>

          {/* Description */}
          <p
            className="text-xs leading-relaxed"
            style={{
              color: 'var(--theme-text-secondary)',
              display: '-webkit-box',
              WebkitLineClamp: expanded ? undefined : 3,
              WebkitBoxOrient: 'vertical',
              overflow: expanded ? 'visible' : 'hidden',
            }}
          >
            {listing.description}
          </p>

          {listing.description.length > 120 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[11px] self-start transition-opacity hover:opacity-70"
              style={{ color: 'var(--theme-accent)' }}
            >
              {expanded ? <><ChevronUp className="w-3 h-3" />פחות</> : <><ChevronDown className="w-3 h-3" />עוד</>}
            </button>
          )}

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {listing.tags.map((t, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded-md text-[10px]"
                  style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Author + time */}
          <div className="flex items-center gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--theme-border)' }}>
            {listing.authorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.authorAvatar} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {listing.authorName?.[0] ?? '?'}
              </div>
            )}
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--theme-text)' }}>
              {listing.authorName}
            </span>
            <span className="text-[11px] mr-auto flex-shrink-0" style={{ color: 'var(--theme-text-secondary)' }}>
              {timeAgo(listing.createdAt)}
            </span>
          </div>

          {/* Stats row */}
          {((listing.viewCount ?? 0) > 0 || (listing.contactCount ?? 0) > 0) && (
            <div className="flex gap-3 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
              {(listing.viewCount ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {listing.viewCount} צפיות
                </span>
              )}
              {(listing.contactCount ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> {listing.contactCount} פניות
                </span>
              )}
            </div>
          )}

          {/* Contact button */}
          {(listing.contactPhone || listing.contactEmail) && (
            <div className="mt-1">
              {!contactRevealed ? (
                <button
                  onClick={handleRevealContact}
                  className="w-full py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${cfg.color}22, ${cfg.color}44)`,
                    border: `1px solid ${cfg.border}`,
                    color: cfg.color,
                  }}
                >
                  <MessageCircle className="w-4 h-4 inline-block ml-1.5" />
                  צור/י קשר
                </button>
              ) : (
                <div
                  className="rounded-xl p-3 space-y-2"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  {listing.contactPhone && (
                    <a
                      href={`tel:${listing.contactPhone}`}
                      className="flex items-center gap-2 text-sm font-bold transition-opacity hover:opacity-70"
                      style={{ color: cfg.color }}
                    >
                      <Phone className="w-4 h-4" />
                      {listing.contactPhone}
                    </a>
                  )}
                  {listing.contactEmail && (
                    <a
                      href={`mailto:${listing.contactEmail}`}
                      className="flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-70 break-all"
                      style={{ color: 'var(--theme-text-secondary)' }}
                    >
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      {listing.contactEmail}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Lightbox */}
      {lightboxIdx !== null && media[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="w-6 h-6" />
          </button>
          {media[lightboxIdx].match(/\.(mp4|webm|mov)$/i) ? (
            <video
              src={media[lightboxIdx]}
              className="max-w-[90vw] max-h-[85vh] rounded-xl"
              controls
              autoPlay
              onClick={e => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media[lightboxIdx]}
              alt=""
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          )}
          {media.length > 1 && (
            <div className="absolute bottom-4 flex gap-2">
              {media.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                  className={`w-2 h-2 rounded-full transition-all ${i === lightboxIdx ? 'bg-white scale-125' : 'bg-white/40'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
