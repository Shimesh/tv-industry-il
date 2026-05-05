'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Calendar,
  Camera,
  ChevronRight,
  Clock,
  ExternalLink,
  Film,
  Globe,
  Layers,
  Mail,
  Map,
  MapPin,
  Maximize2,
  Navigation,
  Phone,
  Radio,
  Sparkles,
  Star,
  Tv,
  Video,
  Wifi,
  X,
  Youtube,
} from 'lucide-react';
import { studios, type StudioLocation, type StudioRecord } from '@/data/studios';

const STUDIO_ICONS: Record<string, ElementType> = {
  'neve-ilan': Radio,
  herzliya: Film,
  kan: Globe,
  keshet12: Tv,
  reshet13: Tv,
  now14: Tv,
  point2point: Camera,
  'kasem-media': Video,
};

type StudioTab = 'overview' | 'locations' | 'facilities' | 'productions' | 'media';

function StatPill({
  icon: Icon,
  label,
  color,
}: {
  icon: ElementType;
  label: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold"
      style={{
        background: `${color}14`,
        borderColor: `${color}33`,
        color,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function LocationRow({
  location,
  accentColor,
}: {
  location: StudioLocation;
  accentColor: string;
}) {
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`;

  return (
    <a
      href={mapLink}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start justify-between gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5"
      style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
    >
      <div className="min-w-0">
        <p className="text-xs font-black" style={{ color: accentColor }}>
          {location.type}
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--theme-text)' }}>
          {location.address}
        </p>
        {location.description && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
            {location.description}
          </p>
        )}
      </div>
      <ExternalLink
        className="mt-1 h-4 w-4 shrink-0 opacity-50 transition group-hover:opacity-100"
        style={{ color: accentColor }}
      />
    </a>
  );
}

function StudioCard({
  studio,
  onClick,
}: {
  studio: StudioRecord;
  onClick: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const Icon = STUDIO_ICONS[studio.id] ?? Building2;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      className="group flex min-h-[430px] w-full flex-col overflow-hidden rounded-2xl border text-right shadow-[0_14px_38px_rgba(0,0,0,0.18)] transition"
      style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
    >
      <div className="relative h-56 overflow-hidden">
        {imageFailed ? (
          <div className="h-full w-full" style={{ background: studio.heroGradient }} />
        ) : (
          <img
            src={studio.heroImage}
            alt={studio.name}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
            onError={() => setImageFailed(true)}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/5" />
        <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
          <Icon className="h-3.5 w-3.5" />
          {studio.location}
        </div>
        <div
          className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-xs font-black text-white shadow-lg"
          style={{ background: studio.accentColor }}
        >
          מידע מעודכן
        </div>
        <div className="absolute bottom-0 right-0 left-0 p-4">
          <h2 className="text-xl font-black leading-tight text-white drop-shadow-lg">{studio.name}</h2>
          {studio.nameEn && <p className="mt-1 text-xs font-semibold text-white/65" dir="ltr">{studio.nameEn}</p>}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {studio.yearFounded && <StatPill icon={Calendar} label={`מ-${studio.yearFounded}`} color={studio.accentColor} />}
          {studio.studioCount && <StatPill icon={Layers} label={`${studio.studioCount} אולפנים`} color={studio.accentColor} />}
          {studio.totalArea && <StatPill icon={Maximize2} label={studio.totalArea} color={studio.accentColor} />}
          {studio.locations && studio.locations.length > 1 && (
            <StatPill icon={MapPin} label={`${studio.locations.length} מיקומים`} color={studio.accentColor} />
          )}
        </div>

        <p className="line-clamp-3 text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
          {studio.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {studio.productions?.slice(0, 3).map(production => (
            <span
              key={production}
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: `${studio.accentColor}18`, color: studio.accentColor }}
            >
              {production}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>
            לחיצה פותחת את כל הפרטים
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-black transition group-hover:gap-2" style={{ color: studio.accentColor }}>
            פתיחה
            <ChevronRight className="h-4 w-4 rotate-180" />
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function StudioDrawer({
  studio,
  onClose,
}: {
  studio: StudioRecord;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<StudioTab>('overview');
  const [imageFailed, setImageFailed] = useState(false);
  const Icon = STUDIO_ICONS[studio.id] ?? Building2;
  const locations = studio.locations?.length ? studio.locations : [{ type: 'כתובת ראשית', address: studio.address }];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const tabs = useMemo(
    () =>
      [
        { id: 'overview' as const, label: 'סקירה' },
        { id: 'locations' as const, label: 'מיקומים' },
        { id: 'facilities' as const, label: 'מתקנים' },
        ...(studio.productions?.length ? [{ id: 'productions' as const, label: 'הפקות' }] : []),
        ...(studio.youtubeVideoId ? [{ id: 'media' as const, label: 'מדיה' }] : []),
      ],
    [studio.productions?.length, studio.youtubeVideoId],
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      />

      <motion.aside
        dir="rtl"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-3xl flex-col overflow-hidden rounded-t-3xl border md:inset-y-6 md:left-6 md:right-auto md:w-[720px] md:rounded-3xl"
        style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
      >
        <div className="relative h-64 shrink-0 overflow-hidden">
          {imageFailed ? (
            <div className="h-full w-full" style={{ background: studio.heroGradient }} />
          ) : (
            <img
              src={studio.heroImage}
              alt={studio.name}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--theme-bg)] via-black/35 to-black/15" />
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute right-5 bottom-5 left-5">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              <Icon className="h-3.5 w-3.5" />
              {studio.location}
            </div>
            <h2 className="text-3xl font-black leading-tight text-white drop-shadow-xl">{studio.name}</h2>
            {studio.nameEn && <p className="mt-1 text-sm text-white/65" dir="ltr">{studio.nameEn}</p>}
          </div>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-3" style={{ borderColor: 'var(--theme-border)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="border-b-2 px-4 py-3 text-sm font-black whitespace-nowrap transition"
              style={{
                borderBottomColor: activeTab === tab.id ? studio.accentColor : 'transparent',
                color: activeTab === tab.id ? 'var(--theme-text)' : 'var(--theme-text-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  <p className="text-base leading-8" style={{ color: 'var(--theme-text-secondary)' }}>
                    {studio.description}
                  </p>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {studio.yearFounded && (
                      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)', background: `${studio.accentColor}10` }}>
                        <Calendar className="mb-2 h-4 w-4" style={{ color: studio.accentColor }} />
                        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>פעיל מאז</p>
                        <p className="text-lg font-black" style={{ color: 'var(--theme-text)' }}>{studio.yearFounded}</p>
                      </div>
                    )}
                    {studio.studioCount && (
                      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)', background: `${studio.accentColor}10` }}>
                        <Layers className="mb-2 h-4 w-4" style={{ color: studio.accentColor }} />
                        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>אולפנים</p>
                        <p className="text-lg font-black" style={{ color: 'var(--theme-text)' }}>{studio.studioCount}</p>
                      </div>
                    )}
                    {studio.totalArea && (
                      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)', background: `${studio.accentColor}10` }}>
                        <Maximize2 className="mb-2 h-4 w-4" style={{ color: studio.accentColor }} />
                        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>שטח</p>
                        <p className="text-lg font-black" style={{ color: 'var(--theme-text)' }}>{studio.totalArea}</p>
                      </div>
                    )}
                    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)', background: `${studio.accentColor}10` }}>
                      <MapPin className="mb-2 h-4 w-4" style={{ color: studio.accentColor }} />
                      <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>מיקומים</p>
                      <p className="text-lg font-black" style={{ color: 'var(--theme-text)' }}>{locations.length}</p>
                    </div>
                  </div>

                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-black" style={{ color: 'var(--theme-text)' }}>
                      <Clock className="h-4 w-4" style={{ color: studio.accentColor }} />
                      רקע
                    </h3>
                    <p className="text-sm leading-7" style={{ color: 'var(--theme-text-secondary)' }}>
                      {studio.history}
                    </p>
                  </section>

                  {studio.notes?.length ? (
                    <section className="rounded-xl border p-4" style={{ borderColor: `${studio.accentColor}33`, background: `${studio.accentColor}10` }}>
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-black" style={{ color: 'var(--theme-text)' }}>
                        <Sparkles className="h-4 w-4" style={{ color: studio.accentColor }} />
                        דיוק חשוב
                      </h3>
                      <div className="space-y-2">
                        {studio.notes.map(note => (
                          <p key={note} className="text-sm leading-6" style={{ color: 'var(--theme-text-secondary)' }}>
                            {note}
                          </p>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="rounded-xl border p-4" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                    <h3 className="mb-3 text-xs font-black uppercase tracking-wider" style={{ color: 'var(--theme-text-secondary)' }}>
                      יצירת קשר
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                        <MapPin className="h-4 w-4 shrink-0 text-red-400" />
                        <span>{studio.address}</span>
                      </div>
                      {studio.phone && (
                        <a href={`tel:${studio.phone}`} className="flex items-center gap-2 text-sm transition hover:opacity-80" style={{ color: 'var(--theme-text-secondary)' }}>
                          <Phone className="h-4 w-4 shrink-0 text-green-400" />
                          <span dir="ltr">{studio.phone}</span>
                        </a>
                      )}
                      {studio.email && (
                        <a href={`mailto:${studio.email}`} className="flex items-center gap-2 text-sm transition hover:opacity-80" style={{ color: 'var(--theme-text-secondary)' }}>
                          <Mail className="h-4 w-4 shrink-0 text-yellow-400" />
                          <span dir="ltr">{studio.email}</span>
                        </a>
                      )}
                      {studio.website && (
                        <a href={studio.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm transition hover:opacity-80" style={{ color: 'var(--theme-text-secondary)' }}>
                          <Globe className="h-4 w-4 shrink-0 text-blue-400" />
                          <span className="truncate" dir="ltr">{studio.website.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        </a>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'locations' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <a
                      href={studio.wazeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-orange-500 to-orange-600 py-3 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition active:scale-[0.98]"
                    >
                      <Navigation className="h-4 w-4" />
                      Waze
                    </a>
                    <a
                      href={studio.googleMapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-blue-500 to-blue-600 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition active:scale-[0.98]"
                    >
                      <Map className="h-4 w-4" />
                      Google Maps
                    </a>
                  </div>

                  <div className="space-y-2">
                    {locations.map(location => (
                      <LocationRow key={`${location.type}-${location.address}`} location={location} accentColor={studio.accentColor} />
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--theme-border)' }}>
                    <iframe
                      src={studio.mapsEmbedUrl}
                      width="100%"
                      height="280"
                      style={{ border: 0 }}
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title={`מפת ${studio.name}`}
                      className="block w-full"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'facilities' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {studio.facilities.map(facility => (
                    <div
                      key={facility}
                      className="flex items-center gap-3 rounded-xl border p-3"
                      style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${studio.accentColor}18` }}>
                        <Wifi className="h-4 w-4" style={{ color: studio.accentColor }} />
                      </span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--theme-text)' }}>
                        {facility}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'productions' && studio.productions && (
                <div className="flex flex-wrap gap-2">
                  {studio.productions.map(production => (
                    <span
                      key={production}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"
                      style={{ background: `${studio.accentColor}12`, borderColor: `${studio.accentColor}30`, color: 'var(--theme-text)' }}
                    >
                      <Star className="h-3.5 w-3.5" style={{ color: studio.accentColor }} />
                      {production}
                    </span>
                  ))}
                </div>
              )}

              {activeTab === 'media' && studio.youtubeVideoId && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--theme-border)' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${studio.youtubeVideoId}`}
                      width="100%"
                      height="260"
                      style={{ border: 0 }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                      title={`סרטון ${studio.name}`}
                      className="block w-full"
                    />
                  </div>
                  {studio.youtubeChannelUrl && (
                    <a
                      href={studio.youtubeChannelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black text-red-400 transition hover:text-red-300"
                      style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}
                    >
                      <Youtube className="h-4 w-4" />
                      ערוץ YouTube הרשמי
                      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                    </a>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
}

export default function StudiosPage() {
  const [selectedStudio, setSelectedStudio] = useState<StudioRecord | null>(null);
  const totalStudios = studios.reduce((acc, studio) => acc + (studio.studioCount ?? 0), 0);
  const earliestYear = Math.min(...studios.filter(studio => studio.yearFounded).map(studio => studio.yearFounded!));

  const handleClose = useCallback(() => setSelectedStudio(null), []);

  return (
    <div dir="rtl" className="min-h-screen pb-14">
      <section className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(168,85,247,0.22),transparent_34%),radial-gradient(circle_at_82%_24%,rgba(95,176,168,0.18),transparent_32%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)', color: 'var(--theme-text-secondary)' }}>
                <Building2 className="h-4 w-4 text-purple-400" />
                מפת האולפנים של תעשיית הטלוויזיה בישראל
              </div>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl gradient-text">אולפני טלוויזיה</h1>
              <p className="mt-3 text-base leading-8" style={{ color: 'var(--theme-text-secondary)' }}>
                כרטיסים ויזואליים עם מיקומים, שיוכים, אולפנים שכורים, מערכות חדשות וניווט מהיר. לחצו על כרטיס כדי לפתוח את כל המידע.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
                <Building2 className="mb-2 h-5 w-5 text-purple-400" />
                <p className="text-2xl font-black" style={{ color: 'var(--theme-text)' }}>{studios.length}</p>
                <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>מתחמים</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
                <Layers className="mb-2 h-5 w-5 text-blue-400" />
                <p className="text-2xl font-black" style={{ color: 'var(--theme-text)' }}>{totalStudios}+</p>
                <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>אולפנים</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
                <Calendar className="mb-2 h-5 w-5 text-green-400" />
                <p className="text-2xl font-black" style={{ color: 'var(--theme-text)' }}>{earliestYear}</p>
                <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>מאז</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {studios.map(studio => (
            <StudioCard key={studio.id} studio={studio} onClick={() => setSelectedStudio(studio)} />
          ))}
        </div>

        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-3 text-2xl font-black" style={{ color: 'var(--theme-text)' }}>
            <Map className="h-6 w-6 text-purple-400" />
            מפת כל האולפנים
          </h2>
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
            <iframe
              src="https://maps.google.com/maps?q=%D7%90%D7%95%D7%9C%D7%A4%D7%A0%D7%99%20%D7%98%D7%9C%D7%95%D7%95%D7%99%D7%96%D7%99%D7%94%20%D7%99%D7%A9%D7%A8%D7%90%D7%9C&output=embed&hl=he&z=8"
              width="100%"
              height="420"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="מפת אולפנים בישראל"
              className="block w-full"
            />
            <div className="border-t px-5 py-3" style={{ borderColor: 'var(--theme-border)' }}>
              <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                <Navigation className="h-4 w-4 text-purple-400" />
                לכל כרטיס יש ניווט מהיר ופתיחה לכל המיקומים המשויכים.
              </p>
            </div>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {selectedStudio && <StudioDrawer studio={selectedStudio} onClose={handleClose} />}
      </AnimatePresence>
    </div>
  );
}
