'use client';

import { useState } from 'react';
import { studios } from '@/data/studios';
import { Building2, MapPin, Phone, Globe, Navigation, Clock, ChevronDown, ChevronUp, ExternalLink, Map, Star, Wifi } from 'lucide-react';

export default function StudiosPage() {
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const toggleHistory = (studioId: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(studioId)) next.delete(studioId);
      else next.add(studioId);
      return next;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Building2 className="w-6 h-6" style={{ color: 'var(--theme-text)' }} />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black gradient-text">אולפני טלוויזיה</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>מידע מקיף על אולפני הטלוויזיה המובילים בישראל</p>
            </div>
          </div>
        </div>
      </section>

      {/* Studios Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {studios.map(studio => (
            <div key={studio.id} className="rounded-xl border p-6 card-glow" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
              {/* Studio Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold" style={{ color: 'var(--theme-text)' }}>{studio.name}</h3>
                  <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 text-sm">
                    <MapPin className="w-3.5 h-3.5" />
                    {studio.location}
                  </span>
                </div>
                <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>

              {/* Description */}
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--theme-text-secondary)' }}>{studio.description}</p>

              {/* History - Collapsible */}
              <div className="mb-4 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                <button onClick={() => toggleHistory(studio.id)}
                  className="flex items-center justify-between w-full px-4 py-3 text-right hover:opacity-80 transition-colors">
                  <span className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'var(--theme-text)' }}>
                    <Clock className="w-4 h-4 text-blue-400" />
                    היסטוריה
                  </span>
                  {expandedHistory.has(studio.id) ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />}
                </button>
                <div className={`transition-all duration-300 ${expandedHistory.has(studio.id) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
                  <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>{studio.history}</p>
                  </div>
                </div>
              </div>

              {/* Facilities */}
              <div className="mb-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--theme-text)' }}>
                  <Star className="w-4 h-4 text-yellow-400" />
                  מתקנים ושירותים
                </h4>
                <div className="flex flex-wrap gap-2">
                  {studio.facilities.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-300 text-xs">
                      <Wifi className="w-3 h-3" />{f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Contact Info */}
              <div className="mb-4 space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                {studio.phone && (
                  <a href={`tel:${studio.phone}`} className="flex items-center gap-2 text-sm hover:text-purple-300 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>
                    <Phone className="w-4 h-4 text-green-400" />{studio.phone}
                  </a>
                )}
                {studio.website && (
                  <a href={studio.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:text-purple-300 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span className="underline underline-offset-2">{studio.website}</span>
                    <ExternalLink className="w-3 h-3" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }} />
                  </a>
                )}
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  <MapPin className="w-4 h-4 text-red-400" />{studio.address}
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <a href={studio.wazeLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-l from-orange-500 to-orange-600 text-white text-sm font-bold shadow-lg shadow-orange-500/15 hover:shadow-orange-500/30 transition-all active:scale-[0.97]">
                  <Navigation className="w-4 h-4" />
                  נווט עם Waze
                </a>
                <a href={studio.googleMapsLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-l from-blue-500 to-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-500/15 hover:shadow-blue-500/30 transition-all active:scale-[0.97]">
                  <Map className="w-4 h-4" />
                  Google Maps
                </a>
              </div>

              {/* Map Embed */}
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--theme-border)' }}>
                <iframe
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(studio.address)}&zoom=15`}
                  width="100%" height="180" style={{ border: 0 }}
                  allowFullScreen loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`מפת ${studio.name}`}
                  className="w-full"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Overview Map */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-3 transition-colors" style={{ color: 'var(--theme-text)' }}>
            <Map className="w-6 h-6 text-purple-400" />
            מפת כל האולפנים
          </h2>
          <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
            <iframe
              src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=אולפני+טלוויזיה+ישראל&zoom=8"
              width="100%" height="400" style={{ border: 0 }}
              allowFullScreen loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="מפת אולפנים בישראל"
              className="w-full"
            />
            <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
              <p className="text-sm flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>
                <Navigation className="w-4 h-4 text-purple-400" />
                לחצו על אולפן לפרטים נוספים ודרכי הגעה
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
