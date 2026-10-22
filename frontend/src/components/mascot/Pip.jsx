import { useEffect, useRef, useState } from 'react';

const EYE_COLORS = { calm: '#c8f135', party: '#c8f135', alert: '#ff5d5d', sleep: '#c8f135' };
const MOOD_CLASS = { calm: 'bot-calm', alert: 'bot-alert', party: 'bot-party', sleep: 'bot-sleep' };

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Pip, the sentry bot. Pure SVG + CSS animation. The eye follows the pointer; the mood
 * changes pose, eye colour and animation: calm | alert | party | sleep.
 */
export function Pip({ mood = 'calm', size = 120, trackPointer = true, className = '' }) {
  const ref = useRef(null);
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!trackPointer || mood === 'sleep' || prefersReducedMotion()) {
      setLook({ x: 0, y: 0 });
      return undefined;
    }
    let frame = 0;
    const onMove = (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height * 0.38);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 260);
        setLook({ x: (dx / distance) * 9 * reach, y: (dy / distance) * 5 * reach });
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, [trackPointer, mood]);

  const eye = EYE_COLORS[mood] ?? EYE_COLORS.calm;
  const armsUp = mood === 'party';

  return (
    <svg
      ref={ref}
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      className={className}
      role="img"
      aria-label={`Pip the sentry bot, ${mood === 'sleep' ? 'asleep' : mood === 'alert' ? 'on alert' : mood === 'party' ? 'celebrating' : 'calm'}`}
    >
      <ellipse className="bot-shadow" cx="60" cy="134" rx="26" ry="3.5" fill="#000" stroke="#2a2a2a" />
      <g className={MOOD_CLASS[mood]} style={{ transformOrigin: '60px 70px', transformBox: 'view-box' }}>
        {/* antenna */}
        <line x1="60" y1="24" x2="60" y2="11" stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />
        <circle className="bot-antenna" cx="60" cy="8" r="4.5" fill={mood === 'alert' ? '#ff5d5d' : '#c8f135'} />

        {/* ears */}
        <rect x="14" y="44" width="9" height="20" rx="3.5" fill="#2a2a2a" />
        <rect x="97" y="44" width="9" height="20" rx="3.5" fill="#2a2a2a" />

        {/* head */}
        <rect x="21" y="22" width="78" height="64" rx="24" fill="#1b1b1b" stroke="#3a3a3a" strokeWidth="2" />
        <rect x="31" y="35" width="58" height="38" rx="15" fill="#050505" />

        {/* eye */}
        {mood === 'sleep' ? (
          <path d="M50 55 Q60 62 70 55" stroke={eye} strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.8" />
        ) : (
          <g style={{ transform: `translate(${look.x}px, ${look.y}px)`, transition: 'transform 0.12s ease-out' }}>
            <g className="bot-blink">
              <circle cx="60" cy="53" r={mood === 'alert' ? 12 : 10} fill={eye} opacity="0.18" />
              <circle cx="60" cy="53" r={mood === 'alert' ? 8.5 : 7.5} fill={eye} />
              <circle cx="63" cy="50" r="2.2" fill="#ffffff" opacity="0.9" />
            </g>
          </g>
        )}
        {(mood === 'calm' || mood === 'party') && (
          <path d="M53 66 Q60 70.5 67 66" stroke={eye} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.7" />
        )}

        {/* neck + body */}
        <rect x="52" y="85" width="16" height="6" rx="2" fill="#2a2a2a" />
        <rect x="37" y="90" width="46" height="34" rx="13" fill="#1b1b1b" stroke="#3a3a3a" strokeWidth="2" />
        <circle cx="60" cy="106" r="4" fill={mood === 'alert' ? '#ff5d5d' : '#c8f135'} opacity="0.9" />

        {/* arms */}
        <g style={{ transformOrigin: '38px 98px', transform: armsUp ? 'rotate(130deg)' : 'rotate(20deg)', transition: 'transform 0.3s' }}>
          <rect x="22" y="95" width="18" height="7" rx="3.5" fill="#2a2a2a" />
        </g>
        <g style={{ transformOrigin: '82px 98px', transform: armsUp ? 'rotate(-130deg)' : 'rotate(-20deg)', transition: 'transform 0.3s' }}>
          <rect x="80" y="95" width="18" height="7" rx="3.5" fill="#2a2a2a" />
        </g>
      </g>

      {mood === 'sleep' && (
        <g fill="#85807a" fontFamily="ui-monospace, monospace" fontWeight="700">
          <text className="bot-zzz" x="92" y="30" fontSize="12">z</text>
          <text className="bot-zzz" x="98" y="22" fontSize="9" style={{ animationDelay: '0.8s' }}>z</text>
          <text className="bot-zzz" x="103" y="15" fontSize="7" style={{ animationDelay: '1.6s' }}>z</text>
        </g>
      )}
    </svg>
  );
}
