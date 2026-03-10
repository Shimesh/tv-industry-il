import Link from 'next/link';
import { Tv, Home, ArrowRight } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-600/20 flex items-center justify-center border border-purple-500/20">
          <Tv className="w-10 h-10 text-purple-400" />
        </div>
        <h1 className="text-6xl font-black gradient-text mb-3">404</h1>
        <h2 className="text-xl font-bold text-white mb-2">הדף לא נמצא</h2>
        <p className="text-gray-400 text-sm mb-8">
          נראה שהדף שחיפשתם לא קיים. אולי הוא הועבר או נמחק.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all"
        >
          <Home className="w-5 h-5" />
          חזרה לדף הבית
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
