'use client';

// Reusable skeleton loader components for loading states

export function SkeletonPulse({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: 'var(--theme-bg-secondary)' }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border p-5" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
      <div className="flex items-start gap-3">
        <SkeletonPulse className="w-12 h-12 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonPulse className="h-4 w-28" />
          <div className="flex gap-2">
            <SkeletonPulse className="h-5 w-16 rounded-full" />
            <SkeletonPulse className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <SkeletonPulse className="h-3 w-12" />
        <SkeletonPulse className="h-3 w-24" />
      </div>
    </div>
  );
}

export function DirectorySkeleton() {
  return (
    <div className="min-h-screen">
      {/* Header skeleton */}
      <section className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center gap-4 mb-2">
            <SkeletonPulse className="w-12 h-12 rounded-xl" />
            <div className="space-y-2">
              <SkeletonPulse className="h-8 w-48" />
              <SkeletonPulse className="h-4 w-64" />
            </div>
          </div>
        </div>
      </section>
      {/* Filter bar skeleton */}
      <section className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <SkeletonPulse className="h-10 flex-1 rounded-xl" />
            <SkeletonPulse className="h-10 w-32 rounded-xl" />
            <SkeletonPulse className="h-10 w-32 rounded-xl" />
          </div>
        </div>
      </section>
      {/* Cards skeleton */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen">
      <section className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <SkeletonPulse className="w-24 h-24 rounded-full" />
            <div className="space-y-3 flex-1">
              <SkeletonPulse className="h-7 w-40 mx-auto sm:mx-0" />
              <div className="flex gap-3 justify-center sm:justify-start">
                <SkeletonPulse className="h-7 w-24 rounded-full" />
                <SkeletonPulse className="h-7 w-20 rounded-full" />
                <SkeletonPulse className="h-7 w-16 rounded-full" />
              </div>
            </div>
            <SkeletonPulse className="h-10 w-24 rounded-xl" />
          </div>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="rounded-xl border p-6" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
              <SkeletonPulse className="h-6 w-32 mb-4" />
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <SkeletonPulse className="w-4 h-4 rounded" />
                    <SkeletonPulse className="h-4 w-16" />
                    <SkeletonPulse className="h-4 w-32" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-xl border p-6" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
              <SkeletonPulse className="h-6 w-28 mb-4" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonPulse key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <SkeletonPulse className="w-10 h-10 rounded-xl" />
        <div className="space-y-2">
          <SkeletonPulse className="h-6 w-24" />
          <SkeletonPulse className="h-3 w-40" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`flex ${i % 3 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className="flex gap-2 max-w-[70%]">
              {i % 3 !== 0 && <SkeletonPulse className="w-8 h-8 rounded-full shrink-0" />}
              <SkeletonPulse className={`h-16 rounded-xl ${i % 3 === 0 ? 'w-48' : 'w-64'}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductionsSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <SkeletonPulse className="w-10 h-10 rounded-xl" />
        <div className="space-y-2">
          <SkeletonPulse className="h-6 w-28" />
          <SkeletonPulse className="h-3 w-48" />
        </div>
      </div>
      <SkeletonPulse className="h-28 w-full rounded-xl mb-6" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonPulse className="h-8 w-full rounded-lg" />
            <SkeletonPulse className="h-20 w-full rounded-lg" />
            {i < 5 && <SkeletonPulse className="h-20 w-full rounded-lg" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function NewsSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <SkeletonPulse className="w-12 h-12 rounded-xl" />
        <div className="space-y-2">
          <SkeletonPulse className="h-8 w-40" />
          <SkeletonPulse className="h-4 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border overflow-hidden" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <SkeletonPulse className="h-48 w-full rounded-none" />
            <div className="p-4 space-y-3">
              <SkeletonPulse className="h-5 w-full" />
              <SkeletonPulse className="h-5 w-3/4" />
              <SkeletonPulse className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <SkeletonPulse className="w-10 h-10 rounded-xl" />
        <div className="space-y-2">
          <SkeletonPulse className="h-6 w-24" />
          <SkeletonPulse className="h-3 w-44" />
        </div>
      </div>
      <div className="space-y-6">
        <SkeletonPulse className="h-20 w-full rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <SkeletonPulse className="h-10 w-full rounded-t-xl rounded-b-none" />
            <div className="p-4 space-y-3">
              <SkeletonPulse className="h-10 w-full rounded-lg" />
              <SkeletonPulse className="h-10 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
