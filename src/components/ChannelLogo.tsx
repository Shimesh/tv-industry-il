'use client';

import Image from 'next/image';
import type { Channel } from '@/data/channels';
import { isLogoImage } from '@/data/channels';

interface ChannelLogoProps {
  channel: Pick<Channel, 'logo' | 'name'>;
  size?: number;             // square px
  rounded?: number;          // border-radius px
  className?: string;
}

/**
 * Renders a channel's mark. If channel.logo is a path under /public
 * (starts with "/"), it renders as an <img>. Otherwise it renders as
 * an emoji glyph sized to look right in the same footprint.
 */
export default function ChannelLogo({ channel, size = 28, rounded = 6, className }: ChannelLogoProps) {
  if (isLogoImage(channel.logo)) {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: rounded,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
          flexShrink: 0,
        }}
      >
        <Image
          src={channel.logo}
          alt={channel.name}
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }}
          unoptimized
        />
      </span>
    );
  }
  // Emoji fallback — sized to match
  return (
    <span
      className={className}
      style={{
        fontSize: Math.round(size * 0.7),
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-label={channel.name}
    >
      {channel.logo}
    </span>
  );
}
