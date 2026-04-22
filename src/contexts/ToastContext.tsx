'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed left-4 z-[9999] flex flex-col gap-2 items-start max-w-sm"
        style={{ direction: 'rtl', bottom: 'calc(1.5rem + var(--safe-area-bottom))' }}
      >
        {toasts.map(toast => {
          const icons = { success: CheckCircle, error: XCircle, info: Info };
          const colors = {
            success: 'bg-green-900/90 border-green-500/40 text-green-100',
            error: 'bg-red-900/90 border-red-500/40 text-red-100',
            info: 'bg-[#1e2d35]/90 border-[#00A884]/40 text-white',
          };
          const iconColors = { success: 'text-green-400', error: 'text-red-400', info: 'text-[#00A884]' };
          const Icon = icons[toast.type];
          return (
            <div
              key={toast.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-xl text-sm font-medium animate-in slide-in-from-bottom-2 duration-300 ${colors[toast.type]}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${iconColors[toast.type]}`} />
              <span className="flex-1">{toast.message}</span>
              <button onClick={() => removeToast(toast.id)} className="opacity-60 hover:opacity-100 transition-opacity shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }
