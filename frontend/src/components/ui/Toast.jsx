import { CircleCheck, Info, Trophy, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext({ notify: () => {} });

const TONES = {
  success: { icon: CircleCheck, className: 'border-emerald-500/40', iconClass: 'text-emerald-300' },
  info: { icon: Info, className: 'border-line-strong', iconClass: 'text-accent-ink' },
  warning: { icon: TriangleAlert, className: 'border-amber-500/40', iconClass: 'text-amber-300' },
  reward: { icon: Trophy, className: 'border-accent/60', iconClass: 'text-accent' },
};

/** Small, non-blocking notifications in the bottom-right corner (announced to screen readers). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    ({ title, message, tone = 'info', duration = 5000 }) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, title, message, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] ?? TONES.info;
          const Icon = tone.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-2 px-4 py-3 shadow-2xl ${tone.className}`}
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${tone.iconClass} ${toast.tone === 'reward' ? 'pop' : ''}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.message && <p className="mt-0.5 text-sm text-ink-2">{toast.message}</p>}
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} className="rounded p-0.5 text-ink-3 hover:text-ink" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
