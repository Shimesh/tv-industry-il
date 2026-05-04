import type { ReactNode } from 'react';

interface LegalDocumentPageProps {
  title: string;
  children: ReactNode;
}

export function LegalDocumentPage({ title, children }: LegalDocumentPageProps) {
  return (
    <div className="min-h-full bg-[var(--theme-bg)] px-4 py-10 sm:px-6 lg:py-14" dir="rtl" lang="he">
      <article
        className="mx-auto max-w-4xl rounded-2xl border p-6 shadow-2xl sm:p-8 lg:p-10"
        style={{
          background: 'var(--theme-bg-card)',
          borderColor: 'var(--theme-border)',
          color: 'var(--theme-text)',
        }}
      >
        <h1 className="mb-8 text-right text-3xl font-black leading-tight sm:text-4xl">{title}</h1>
        <div className="legal-document space-y-7 text-right text-base leading-8 sm:text-lg">{children}</div>
      </article>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-extrabold leading-8 sm:text-2xl">{title}</h2>
      {children}
    </section>
  );
}
