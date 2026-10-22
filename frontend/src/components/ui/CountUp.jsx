import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../lib/format.js';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from its previous value to the new one (ease-out, ~0.7 s). */
export function CountUp({ value, duration = 700 }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  const from = useRef(reducedMotion() ? value : 0);

  useEffect(() => {
    if (typeof value !== 'number') return undefined;
    if (reducedMotion()) {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(origin + (value - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="tabular">{formatNumber(shown)}</span>;
}
