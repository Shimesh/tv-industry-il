'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin, User } from 'lucide-react';

interface Professional {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: string | null;
  department: string | null;
  city: string | null;
}

export default function ProfessionalsSection() {
  const [pros, setPros] = useState<Professional[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/home/professionals')
      .then((r) => r.json())
      .then((data) => { if (data.success) setPros(data.items); })
      .catch(() => {});
  }, []);

  const scroll = (dir: 'right' | 'left') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? 220 : -220, behavior: 'smooth' });
  };

  if (pros.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-1 h-6 rounded-full"
            style={{ background: '#9d4edd', boxShadow: '0 0 10px rgba(157,78,221,0.7)' }}
          />
          <h2 className="text-base font-black tracking-wide" style={{ color: '#fff' }}>
            אנשי המקצוע המוכשרים
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/phonebook"
            className="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity ml-2"
            style={{ color: '#9d4edd' }}
          >
            כל האלפון
          </Link>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105"
            style={{
              background: 'rgba(157,78,221,0.08)',
              border: '1px solid rgba(157,78,221,0.25)',
              color: '#9d4edd',
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105"
            style={{
              background: 'rgba(157,78,221,0.08)',
              border: '1px solid rgba(157,78,221,0.25)',
              color: '#9d4edd',
            }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scroll row */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {pros.map((pro) => (
          <Link
            key={pro.uid}
            href={`/phonebook?uid=${pro.uid}`}
            className="flex-none group"
            style={{ width: '170px', scrollSnapAlign: 'start' }}
          >
            <div
              className="flex flex-col items-center gap-3 p-4 rounded-2xl transition-all duration-300 group-hover:scale-[1.03]"
              style={{
                background: 'rgba(19,19,31,0.80)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(12px)',
              }}
            >
              {/* Avatar */}
              <div className="relative">
                <div
                  className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
                  style={{
                    border: '2px solid rgba(157,78,221,0.45)',
                    boxShadow: '0 0 16px rgba(157,78,221,0.25)',
                    background: '#1a1a3e',
                  }}
                >
                  {pro.photoURL ? (
                    <img
                      src={pro.photoURL}
                      alt={pro.displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = 'none';
                        el.parentElement!.querySelector<HTMLElement>('.avatar-fallback')!.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="avatar-fallback w-full h-full items-center justify-center"
                    style={{ display: pro.photoURL ? 'none' : 'flex' }}
                  >
                    <User className="w-7 h-7" style={{ color: '#9d4edd' }} />
                  </div>
                </div>

                {/* Online dot */}
                <div
                  className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full"
                  style={{
                    background: '#22c55e',
                    border: '2px solid #13131f',
                    boxShadow: '0 0 6px rgba(34,197,94,0.6)',
                  }}
                />
              </div>

              {/* Name */}
              <div className="text-center">
                <p
                  className="text-sm font-bold leading-tight line-clamp-1"
                  style={{ color: '#fff' }}
                >
                  {pro.displayName}
                </p>

                {/* Role */}
                {(pro.role || pro.department) && (
                  <p
                    className="text-[11px] mt-0.5 line-clamp-1"
                    style={{ color: '#a0aec0' }}
                  >
                    {pro.role ?? pro.department}
                  </p>
                )}

                {/* City */}
                {pro.city && (
                  <div
                    className="flex items-center justify-center gap-0.5 mt-1.5"
                    style={{ color: '#9d4edd' }}
                  >
                    <MapPin className="w-3 h-3" />
                    <span className="text-[10px]">{pro.city}</span>
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
