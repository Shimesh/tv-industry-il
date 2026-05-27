'use client';

interface CollageItem {
  imageUrl?: string;
  isSourceLogoFallback?: boolean;
  title: string;
  source?: string;
}

interface Props {
  items: CollageItem[];
}

const FALLBACK_COLORS = ['#1a1040', '#0d1a40', '#1a0d40', '#0d2840'];

function Cell({ src, alt, tall }: { src?: string; alt: string; tall?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl ${tall ? 'row-span-2' : ''}`}
      style={{ background: '#12122a' }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(8,8,30,0.75) 0%, transparent 55%)' }}
      />
    </div>
  );
}

export default function NewsImageCollage({ items }: Props) {
  const imgs = items
    .filter((i) => i.imageUrl && !i.isSourceLogoFallback)
    .slice(0, 5);

  // pad to 5 with placeholder objects
  while (imgs.length < 5) imgs.push({ title: '', imageUrl: undefined });

  return (
    <div className="relative select-none">
      {/* Outer ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: '-30px',
          background:
            'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(157,78,221,0.22) 0%, transparent 70%)',
          filter: 'blur(24px)',
        }}
      />

      {/* Main frame */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          border: '1px solid rgba(157,78,221,0.28)',
          boxShadow:
            '0 0 0 1px rgba(0,240,255,0.08), 0 32px 72px rgba(0,0,0,0.55)',
          background: '#0a0a1e',
        }}
      >
        {/* Top bar — fake browser chrome */}
        <div
          className="flex items-center gap-1.5 px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(239,68,68,0.7)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(251,191,36,0.7)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(34,197,94,0.7)' }} />
          <div
            className="mr-3 flex-1 rounded-full px-2 py-0.5 text-center text-[10px]"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
          >
            tv-industry-il.vercel.app
          </div>
        </div>

        {/* Image mosaic */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '2px',
            padding: '2px',
          }}
        >
          {/* Col 1 — tall (rows 1+2) */}
          <div style={{ gridRow: '1 / 3', position: 'relative', minHeight: '260px' }}>
            <Cell src={imgs[0].imageUrl} alt={imgs[0].title} />
            {/* ON AIR badge */}
            <div
              className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black text-white"
              style={{ background: 'rgba(239,68,68,0.92)', backdropFilter: 'blur(8px)' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-white"
                style={{ animation: 'pulse-glow 1.5s ease-in-out infinite' }}
              />
              ON AIR
            </div>
          </div>

          {/* Col 2, row 1 */}
          <div style={{ position: 'relative', minHeight: '130px' }}>
            <Cell src={imgs[1].imageUrl} alt={imgs[1].title} />
          </div>

          {/* Col 3, row 1 */}
          <div style={{ position: 'relative', minHeight: '130px' }}>
            <Cell src={imgs[2].imageUrl} alt={imgs[2].title} />
          </div>

          {/* Col 2, row 2 */}
          <div style={{ position: 'relative', minHeight: '130px' }}>
            <Cell src={imgs[3].imageUrl} alt={imgs[3].title} />
          </div>

          {/* Col 3, row 2 */}
          <div style={{ position: 'relative', minHeight: '130px' }}>
            <Cell src={imgs[4].imageUrl} alt={imgs[4].title} />
          </div>
        </div>

        {/* Inner gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(135deg, rgba(157,78,221,0.06) 0%, transparent 50%, rgba(0,240,255,0.04) 100%)',
          }}
        />
      </div>

      {/* Floating "live" badge */}
      <div
        className="absolute -bottom-5 -right-4 flex items-center gap-2 rounded-2xl px-4 py-2.5"
        style={{
          background: 'rgba(13,13,35,0.94)',
          border: '1px solid rgba(0,240,255,0.22)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <div>
          <div className="text-[10px] font-bold" style={{ color: '#00f0ff' }}>עכשיו בשידור</div>
          <div className="text-white font-black text-sm leading-none">7 ערוצים</div>
        </div>
      </div>
    </div>
  );
}
