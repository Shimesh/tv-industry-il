'use client';

import { channels, channelGroups, generateSchedule, getCurrentProgram, getNextProgram } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import type { Channel } from '@/data/channels';

interface ChannelSidebarProps {
  selectedChannelId: string;
  onSelectChannel: (id: string) => void;
  isMobile?: boolean;
}

function ChannelCard({ ch, isSelected, onSelect }: { ch: Channel; isSelected: boolean; onSelect: () => void }) {
  const stream = streamConfigs[ch.id];
  const schedule = generateSchedule(ch.id);
  const current = getCurrentProgram(schedule);
  const next = getNextProgram(schedule);
  const hasLive = stream?.hasLiveStream;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-right transition-all duration-200 rounded-lg p-2.5 group ${
        isSelected
          ? 'ring-1'
          : 'hover:bg-white/[0.04]'
      }`}
      style={{
        backgroundColor: isSelected ? `${ch.color}15` : 'transparent',
        ...(isSelected ? {
          ringColor: `${ch.color}50`,
          boxShadow: `0 0 15px ${ch.color}15, inset 0 0 15px ${ch.color}08`,
          border: `1px solid ${ch.color}35`,
        } : {
          border: '1px solid transparent',
        }),
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* Logo + live dot */}
        <div className="relative shrink-0">
          <span className="text-xl">{ch.logo}</span>
          {hasLive && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-[#13131a]" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-white/70 group-hover:text-white/90'}`}>
              {ch.name}
            </span>
            {ch.number > 0 && (
              <span className="text-[10px] text-white/30 shrink-0">{ch.number}</span>
            )}
          </div>

          {/* Current program */}
          {current && (
            <p className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-white/50' : 'text-white/30'}`}>
              {current.title}
            </p>
          )}
        </div>

        {/* Live indicator */}
        {hasLive && (
          <span className="shrink-0 text-[9px] font-bold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
            LIVE
          </span>
        )}
      </div>
    </button>
  );
}

export function ChannelSidebar({ selectedChannelId, onSelectChannel, isMobile }: ChannelSidebarProps) {
  if (isMobile) {
    // Mobile: horizontal scrollable rail
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-2 hide-scrollbar px-1">
        {channels.map(ch => {
          const isSelected = ch.id === selectedChannelId;
          const stream = streamConfigs[ch.id];
          return (
            <button
              key={ch.id}
              onClick={() => onSelectChannel(ch.id)}
              className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all ${
                isSelected ? 'ring-1' : ''
              }`}
              style={{
                backgroundColor: isSelected ? `${ch.color}20` : 'rgba(255,255,255,0.04)',
                ...(isSelected ? { border: `1px solid ${ch.color}40` } : { border: '1px solid transparent' }),
              }}
            >
              <div className="relative">
                <span className="text-lg">{ch.logo}</span>
                {stream?.hasLiveStream && (
                  <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 bg-green-400 rounded-full" />
                )}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${isSelected ? 'text-white' : 'text-white/50'}`}>
                {ch.name}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Desktop: grouped sidebar
  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1 custom-scrollbar">
      {channelGroups.map(group => {
        const groupChannels = channels.filter(c => group.channels.includes(c.id));
        if (groupChannels.length === 0) return null;

        return (
          <div key={group.id}>
            <h3 className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-1.5 px-2">
              {group.label}
            </h3>
            <div className="space-y-0.5">
              {groupChannels.map(ch => (
                <ChannelCard
                  key={ch.id}
                  ch={ch}
                  isSelected={ch.id === selectedChannelId}
                  onSelect={() => onSelectChannel(ch.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
