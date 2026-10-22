import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Pip } from './Pip.jsx';
import { useMascot } from './useMascot.js';

const HIDE_KEY = 'honeypot.pipHidden';
const TIPS = [
  'Tip: the Practice lab lets you trigger safe, simulated attacks.',
  'Tip: click any event to see exactly why it was flagged.',
  'Tip: the status pill at the top hides the details until you need them.',
  'Tip: missions give XP. Can you reach Guardian rank?',
  'Tip: Rules → Tune lets you change how sensitive each rule is.',
];

const TONE_CLASS = {
  danger: 'border-red-500/50',
  warn: 'border-amber-500/40',
  reward: 'border-accent/60',
  info: 'border-line-strong',
};

function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Pip in the corner: reacts to alerts, missions and outages with one short sentence. */
export function PipBuddy() {
  const { pathname } = useLocation();
  const { mood, message } = useMascot();
  const [bubble, setBubble] = useState(null);
  const [hidden, setHidden] = useState(readHidden);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!message) return undefined;
    setBubble(message);
    const timer = setTimeout(() => setBubble((current) => (current?.id === message.id ? null : current)), 7000);
    return () => clearTimeout(timer);
  }, [message]);

  function setHiddenPersisted(value) {
    setHidden(value);
    try {
      localStorage.setItem(HIDE_KEY, value ? '1' : '0');
    } catch {
      // per-viewer convenience only
    }
  }

  if (pathname === '/') return null;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHiddenPersisted(false)}
        className="fixed bottom-4 left-4 z-30 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-3 hover:text-ink"
      >
        Show Pip
      </button>
    );
  }

  function poke() {
    const tip = TIPS[tipIndex % TIPS.length];
    setTipIndex((i) => i + 1);
    setBubble({ id: `tip-${Date.now()}`, tone: 'info', text: tip });
  }

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-30 flex items-end gap-1 lg:bottom-6 lg:left-5">
      <button type="button" onClick={poke} className="pointer-events-auto rounded-full" aria-label="Pip the sentry bot. Click for a tip.">
        <Pip mood={mood} size={64} />
      </button>
      {bubble && (
        <div
          key={bubble.id}
          role="status"
          className={`bubble-in pointer-events-auto mb-10 max-w-[260px] rounded-2xl rounded-bl-sm border bg-surface-2 px-3.5 py-2.5 text-sm text-ink shadow-2xl ${TONE_CLASS[bubble.tone] ?? TONE_CLASS.info}`}
        >
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1">
              {bubble.text}
              {bubble.to && (
                <Link to={bubble.to} className="ml-1 font-medium text-accent hover:text-accent-ink">
                  Look
                </Link>
              )}
            </p>
            <button type="button" onClick={() => setBubble(null)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
          <button type="button" onClick={() => setHiddenPersisted(true)} className="mt-1 text-[11px] text-ink-3 hover:text-ink">
            Hide Pip
          </button>
        </div>
      )}
    </div>
  );
}
