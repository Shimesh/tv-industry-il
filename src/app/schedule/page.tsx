'use client';

import { useState, useEffect, useRef } from 'react';
import { channels, generateSchedule, getCurrentProgram, getNextProgram, type ScheduleItem } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import { Play, Clock, Radio, Monitor, ExternalLink, Lock, Unlock, Globe, AlertCircle } from 'lucide-react';

export default function SchedulePage() {
  const [selectedChannel, setSelectedChannel] = useState(channels[0].id);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTimeout(() => {
      currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, [selectedChannel]);

  const channel = channels.find(c => c.id === selectedChannel) || channels[0];
  const schedule = generateSchedule(selectedChannel);
  const currentProgram = currentTime ? getCurrentProgram(schedule) : null;
  const nextProgram = currentTime ? getNextProgram(schedule) : null;
  const timeStr = currentTime
    ? `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`
    : '00:00';
  const stream = streamConfigs[selectedChannel];

  const mainChannels = channels.filter(c => c.category === 'main');
  const sportChannels = channels.filter(c => c.category === 'sport');
  const newsChannels = channels.filter(c => c.category === 'news');

  const isPast = (time: string) => time < timeStr;
  const isCurrent = (item: ScheduleItem) => item === currentProgram;

  // Free channels (public/free-external)
  const isFree = stream && !stream.requiresAuth;
  // Paid channels (requires subscription)
  const isPaid = stream && stream.requiresAuth;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative overflow-hidden border-b transition-colors" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="absolute inset-0 bg-gradient-to-bl from-blue-900/20 via-transparent to-purple-900/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Monitor className="w-6 h-6" style={{ color: '#ffffff' }} />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black gradient-text">לוח שידורים</h1>
              <p className="text-sm mt-1 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>צפו בלוח השידורים המעודכן של כל ערוצי הטלוויזיה</p>
            </div>
          </div>
          {currentTime && (
            <div className="flex items-center gap-2 mt-4 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>
              <Clock className="w-4 h-4" />
              <span className="text-sm">{currentTime.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="font-mono font-bold text-lg mr-2" style={{ color: 'var(--theme-text)' }}>{currentTime.toLocaleTimeString('he-IL')}</span>
            </div>
          )}
        </div>
      </section>

      {/* Channel Selector */}
      <section className="border-b backdrop-blur sticky top-16 z-30 transition-colors" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="space-y-3">
            {/* Main Channels */}
            <div>
              <span className="text-xs font-medium mb-1.5 block transition-colors" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>ערוצים ראשיים</span>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                {mainChannels.map(ch => (
                  <button key={ch.id} onClick={() => setSelectedChannel(ch.id)}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedChannel === ch.id
                        ? 'shadow-lg'
                        : 'hover:opacity-80'
                    }`}
                    style={selectedChannel === ch.id
                      ? { backgroundColor: ch.color + '30', borderColor: ch.color, border: `1px solid ${ch.color}60`, color: 'var(--theme-text)' }
                      : { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }
                    }>
                    <span>{ch.logo}</span>
                    <span>{ch.name}</span>
                    {ch.number > 0 && <span className="text-xs opacity-60">({ch.number})</span>}
                  </button>
                ))}
              </div>
            </div>
            {/* Sport Channels */}
            <div>
              <span className="text-xs font-medium mb-1.5 block transition-colors" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>ערוצי ספורט</span>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                {sportChannels.map(ch => (
                  <button key={ch.id} onClick={() => setSelectedChannel(ch.id)}
                    className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedChannel === ch.id
                        ? 'shadow-lg'
                        : 'hover:opacity-80'
                    }`}
                    style={selectedChannel === ch.id
                      ? { backgroundColor: ch.color + '30', border: `1px solid ${ch.color}60`, color: 'var(--theme-text)' }
                      : { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }
                    }>
                    <span>{ch.logo}</span>
                    <span>{ch.name}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* News */}
            <div>
              <span className="text-xs font-medium mb-1.5 block transition-colors" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>חדשות</span>
              <div className="flex gap-2 pb-1">
                {newsChannels.map(ch => (
                  <button key={ch.id} onClick={() => setSelectedChannel(ch.id)}
                    className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedChannel === ch.id
                        ? 'shadow-lg'
                        : 'hover:opacity-80'
                    }`}
                    style={selectedChannel === ch.id
                      ? { backgroundColor: ch.color + '30', border: `1px solid ${ch.color}60`, color: 'var(--theme-text)' }
                      : { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }
                    }>
                    <span>{ch.logo}</span>
                    <span>{ch.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Live Viewer */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border overflow-hidden transition-colors" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
              {/* Watch Live Area */}
              <div className="relative aspect-video overflow-hidden" style={{ background: `radial-gradient(ellipse at center, ${channel.color}18 0%, var(--theme-bg-secondary) 70%)` }}>
                {/* Decorative background elements */}
                <div className="absolute inset-0 opacity-5">
                  <div className="absolute top-4 right-4 text-[120px] leading-none" style={{ color: channel.color }}>{channel.logo}</div>
                </div>

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    {/* Channel Logo */}
                    <div className="text-6xl sm:text-7xl mb-4 drop-shadow-lg animate-pulse-slow">{channel.logo}</div>

                    {/* Channel Name with live indicator */}
                    <div className="flex items-center justify-center gap-2.5 mb-2">
                      <span className="w-3 h-3 rounded-full pulse-live" style={{ backgroundColor: channel.color }} />
                      <span className="font-black text-xl" style={{ color: 'var(--theme-text)' }}>{channel.name}</span>
                    </div>

                    {/* Current program */}
                    {currentProgram && (
                      <p className="text-sm mb-5 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>
                        כרגע: {currentProgram.title}
                      </p>
                    )}

                    {/* Watch Live Button or no-stream message */}
                    {stream ? (
                      <div className="space-y-3">
                        {/* Availability badge */}
                        {isPaid ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            <Lock className="w-3.5 h-3.5" />
                            <span>{stream.note}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                            <Unlock className="w-3.5 h-3.5" />
                            <span>{stream.note}</span>
                          </div>
                        )}

                        {/* Large Watch Button */}
                        <div>
                          <a
                            href={stream.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-bold text-base transition-all duration-200 hover:scale-105 hover:shadow-2xl active:scale-100"
                            style={{
                              background: isPaid
                                ? `linear-gradient(135deg, ${channel.color}, ${channel.color}cc)`
                                : 'linear-gradient(135deg, #ef4444, #dc2626)',
                              boxShadow: isPaid
                                ? `0 8px 30px ${channel.color}35`
                                : '0 8px 30px rgba(239, 68, 68, 0.35)',
                            }}
                          >
                            <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                              <Play className="w-5 h-5 ml-0.5" fill="white" />
                            </span>
                            {isPaid
                              ? `צפה באתר ${stream.provider || channel.name}`
                              : 'צפה בשידור חי'}
                            <ExternalLink className="w-4 h-4 opacity-60" />
                          </a>
                        </div>

                        {isPaid && (
                          <p className="text-[10px] max-w-xs mx-auto" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }}>
                            צפייה ישירה דרך ספק הטלוויזיה שלך (HOT, YES, Partner)
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm mt-2" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }}>
                        אין שידור חי זמין כרגע
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Now Playing */}
              {currentProgram && (
                <div className="p-4 border-t transition-colors" style={{ borderColor: 'var(--theme-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Play className="w-4 h-4" style={{ color: channel.color }} />
                    <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>עכשיו משדרים</span>
                    {isFree && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                        <Unlock className="w-3 h-3" />
                        צפייה חופשית
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>{currentProgram.title}</h3>
                  <p className="text-sm transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>{currentProgram.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs transition-colors" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{currentProgram.time}</span>
                    <span>{currentProgram.duration}</span>
                    {currentProgram.genre && (
                      <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: channel.color + '20', color: channel.color }}>{currentProgram.genre}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Up Next */}
              {nextProgram && (
                <div className="p-4 border-t transition-colors" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Radio className="w-3 h-3" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>הבא בתור</span>
                  </div>
                  <h4 className="text-sm font-bold transition-colors" style={{ color: 'var(--theme-text)' }}>{nextProgram.title}</h4>
                  <p className="text-xs transition-colors" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>{nextProgram.time} | {nextProgram.duration}</p>
                </div>
              )}

              {/* Quick links to channel website */}
              {stream && (
                <div className="p-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                    <Globe className="w-3.5 h-3.5" />
                    <span>אתר הערוץ:</span>
                  </div>
                  <a
                    href={stream.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium hover:underline"
                    style={{ color: 'var(--theme-accent)' }}
                  >
                    {stream.websiteUrl.replace('https://', '').replace('http://', '').split('/')[0]}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Schedule List */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border overflow-hidden transition-colors" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
              <div className="p-4 border-b flex items-center justify-between transition-colors" style={{ borderColor: 'var(--theme-border)' }}>
                <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
                  <Clock className="w-4 h-4" style={{ color: channel.color }} />
                  לוח שידורים - {channel.name}
                </h3>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {schedule.map((item, i) => {
                  const current = isCurrent(item);
                  const past = isPast(item.time) && !current;

                  return (
                    <div
                      key={i}
                      ref={current ? currentRef : undefined}
                      className={`p-3 border-b transition-all ${
                        past ? 'opacity-50' : ''
                      }`}
                      style={{
                        borderColor: 'var(--theme-border)',
                        ...(current ? {
                          background: 'var(--theme-bg-secondary)',
                          borderInlineEnd: `3px solid ${channel.color}`,
                          boxShadow: `inset 4px 0 12px ${channel.color}20`
                        } : {})
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-right shrink-0 w-12">
                          <span className="font-mono font-bold text-sm" style={{ color: current ? 'var(--theme-text)' : 'var(--theme-text-secondary)' }}>{item.time}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm truncate" style={{ color: current ? 'var(--theme-text)' : 'var(--theme-text-secondary)' }}>{item.title}</h4>
                            {item.isLive && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 pulse-live" />
                                LIVE
                              </span>
                            )}
                            {current && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ backgroundColor: channel.color + '30', color: channel.color }}>
                                עכשיו
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs mt-0.5 truncate transition-colors" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>{item.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px]" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }}>{item.duration}</span>
                            {item.genre && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded transition-colors" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)', opacity: 0.7 }}>{item.genre}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Schedule note */}
              <div className="p-3 border-t text-center" style={{ borderColor: 'var(--theme-border)' }}>
                <p className="text-[10px] flex items-center justify-center gap-1" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }}>
                  <AlertCircle className="w-3 h-3" />
                  לוח השידורים מבוסס על נתונים מוערכים ועשוי להשתנות
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
