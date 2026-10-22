import { useEffect, useMemo, useState } from 'react';

const COLORS = ['#f4f1ea', '#f4f1ea', '#34d399', '#60a5fa', '#e879f9', '#fbbf24'];

/** A one-shot confetti burst from the top-centre of the screen whenever `burstKey` changes. */
export function Confetti({ burstKey, pieces = 70 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!burstKey) return undefined;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2200);
    return () => clearTimeout(timer);
  }, [burstKey]);

  const particles = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = Math.random() * Math.PI - Math.PI; // spray upward and out, then fall
        const speed = 160 + Math.random() * 320;
        return {
          id: `${burstKey}-${i}`,
          color: COLORS[i % COLORS.length],
          dx: `${Math.cos(angle) * speed}px`,
          dy: `${Math.sin(angle) * speed * 0.6 + 380 + Math.random() * 200}px`,
          rot: `${(Math.random() - 0.5) * 900}deg`,
          dur: `${1.2 + Math.random() * 0.8}s`,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          round: Math.random() > 0.7,
        };
      }),
    [burstKey, pieces],
  );

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[60] flex justify-center" aria-hidden="true">
      <div className="relative">
        {particles.map((p) => (
          <span
            key={p.id}
            className="confetti-piece absolute left-0 top-0"
            style={{
              width: p.w,
              height: p.round ? p.w : p.h,
              borderRadius: p.round ? '999px' : '2px',
              backgroundColor: p.color,
              '--dx': p.dx,
              '--dy': p.dy,
              '--rot': p.rot,
              '--dur': p.dur,
            }}
          />
        ))}
      </div>
    </div>
  );
}
