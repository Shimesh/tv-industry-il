'use client';

import { channels, channelGroups } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import type { Channel } from '@/data/channels';
import type { BroadcastChannelState } from '@/lib/broadcasts';
import ChannelLogo from '@/components/ChannelLogo';

interface ChannelSidebarProps {
  selectedChannelId: string;
  onSelectChannel: (id: string) => void;
  isMobile?: boolean;
  byChannelId?: Record<string, BroadcastChannelState>;
  loading?: boolean;
}

function ChannelCard({
  channel,
  isSelected,
  onSelect,
  state,
  loading,
}: {
  channel: Channel;
  isSelected: boolean;
  onSelect: () => void;
  state?: BroadcastChannelState;
  loading?: boolean;
}) {
  const stream = streamConfigs[channel.id];
  const current = state?.now.current ?? null;
  const next = state?.now.next ?? null;
  const hasLive = Boolean(stream?.hasLiveStream);
  const statusLabel = current?.title || next?.title || (loading ? 'טוען לוח שידורים...' : 'אין מידע זמין כרגע');

  return (
    <button
      onClick={onSelect}
      className={`group w-full rounded-lg p-2.5 text-right transition-all duration-200 ${isSelected ? 'ring-1' : 'hover:bg-[var(--theme-accent-glow)]'}`}
      style={{
        backgroundColor: isSelected ? `${channel.color}15` : 'transparent',
        ...(isSelected
          ? {
              ringColor: `${channel.color}50`,
              boxShadow: `0 0 15px ${channel.color}15, inset 0 0 15px ${channel.color}08`,
              border: `1px solid ${channel.color}35`,
            }
          : {
              border: '1px solid transparent',
            }),
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <ChannelLogo channel={channel} size={32} rounded={8} />
          {hasLive && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border bg-[var(--theme-success)]" style={{ borderColor: 'var(--theme-bg)' }} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-sm font-bold ${isSelected ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text)]'}`}>
              {channel.name}
            </span>
            {channel.number > 0 && <span className="shrink-0 text-[10px] text-[var(--theme-text-secondary)] opacity-70">{channel.number}</span>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[var(--theme-text-secondary)] opacity-80">{statusLabel}</p>
        </div>

        {hasLive && <span className="shrink-0 rounded bg-green-400/10 px-1.5 py-0.5 text-[9px] font-bold text-green-400">LIVE</span>}
      </div>
    </button>
  );
}

export function ChannelSidebar({ selectedChannelId, onSelectChannel, isMobile, byChannelId, loading }: ChannelSidebarProps) {
  if (isMobile) {
    return (
      <div className="hide-scrollbar flex gap-1.5 overflow-x-auto px-1 pb-2">
        {channels.map((channel) => {
          const isSelected = channel.id === selectedChannelId;
          const stream = streamConfigs[channel.id];
          return (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel.id)}
              className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-2 transition-all ${isSelected ? 'ring-1' : ''}`}
              style={{
                backgroundColor: isSelected ? `${channel.color}20` : 'var(--theme-bg-card)',
                ...(isSelected ? { border: `1px solid ${channel.color}40` } : { border: '1px solid transparent' }),
              }}
            >
              <div className="relative">
                <ChannelLogo channel={channel} size={28} rounded={7} />
                {stream?.hasLiveStream && <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-green-400" />}
              </div>
              <span className={`whitespace-nowrap text-[10px] font-medium ${isSelected ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{channel.name}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="custom-scrollbar h-full space-y-4 overflow-y-auto pr-1">
      {channelGroups.map((group) => {
        const groupChannels = channels.filter((channel) => group.channels.includes(channel.id));
        if (groupChannels.length === 0) return null;

        return (
          <div key={group.id}>
            <h3 className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-secondary)] opacity-70">{group.label}</h3>
            <div className="space-y-0.5">
              {groupChannels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  isSelected={channel.id === selectedChannelId}
                  onSelect={() => onSelectChannel(channel.id)}
                  state={byChannelId?.[channel.id]}
                  loading={loading}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
