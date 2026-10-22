import { useEffect, useMemo, useRef, useState } from 'react';
import { SOCKET_EVENTS } from '../../api/socket.js';
import { useSocketEvent } from '../../hooks/useSocket.js';
import { Pip } from '../mascot/Pip.jsx';

/**
 * The defense scene. Every flagged request is drawn as an alien ship and its real outcome
 * decides its fate: blocked -> shot down by the turret, rate-limited -> frozen in a stasis
 * bubble, logged -> spotted by radar and flies off. Normal requests are friendly shuttles that
 * land on the planet (your honeypot). Simulated events are tagged "sim" so they are never
 * mistaken for real traffic.
 */

const W = 1000;
const H = 420;
const TURRET = { x: 500, y: 318, barrel: 36 };
const SLOTS = [170, 330, 500, 670, 830];
const MAX_ACTIVE = 5;

export const ALIEN_NAMES = {
  'excessive-requests': 'flooder',
  'repeated-failed-login': 'password guesser',
  'suspicious-path': 'snooper',
  'malformed-request': 'glitcher',
  'route-enumeration': 'page guesser',
  'traffic-anomaly': 'swarm',
  'active-enforcement': 'repeat offender',
  'api-rate-limit': 'API spammer',
};

const SEVERITY_COLOR = { info: '#94a3b8', low: '#60a5fa', medium: '#fbbf24', high: '#f87171', critical: '#fb7185' };
const SEVERITY_SCALE = { info: 0.7, low: 0.75, medium: 0.85, high: 1.05, critical: 1.35 };

export function fateOf(event) {
  if (event.classification === 'normal') return 'friendly';
  if (event.actionTaken === 'blocked') return 'destroyed';
  if (event.actionTaken === 'rate-limited') return 'frozen';
  return 'spotted';
}

function hash(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function placement(event, seq) {
  const h = hash(event.id);
  const hx = SLOTS[seq % SLOTS.length] + ((h % 40) - 20);
  const hy = 80 + ((h >> 3) % 120);
  return { hx, hy, sx: hx + (((h >> 5) % 300) - 150), ex: hx > W / 2 ? W + 120 : -120 };
}

/** Seeded stars so the sky is identical on every render. */
function makeStars(count) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand() * W,
    y: rand() * 330,
    r: 0.5 + rand() * 1.3,
    tw: `${2 + rand() * 4}s`,
    td: `${rand() * 4}s`,
  }));
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------------------------------------------ pieces */

function Saucer({ severity }) {
  const color = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.medium;
  const mothership = severity === 'critical';
  return (
    <g>
      {mothership && <ellipse cx="0" cy="2" rx="44" ry="7" fill="none" stroke={color} strokeOpacity="0.5" strokeDasharray="3 4" />}
      <ellipse cx="0" cy="-8" rx="14" ry="11" fill={color} fillOpacity="0.85" />
      <ellipse cx="-4" cy="-11" rx="4" ry="2.5" fill="#fff" fillOpacity="0.55" />
      <ellipse cx="0" cy="0" rx="32" ry="9" fill="#d8d3c8" />
      <ellipse cx="0" cy="6" rx="19" ry="5" fill="#8f8a80" />
      <g className="ship-lights" fill={color}>
        <circle cx="-20" cy="1" r="2.2" />
        <circle cx="0" cy="3" r="2.2" />
        <circle cx="20" cy="1" r="2.2" />
      </g>
    </g>
  );
}

function Ship({ item, onSelect, staticMode, labels }) {
  const { event, fate, hx, hy, sx, ex, life } = item;
  const scale = SEVERITY_SCALE[event.severity] ?? 0.85;
  const name = `${ALIEN_NAMES[event.category] ?? 'invader'}${event.simulated ? ' · sim' : ''}`;
  const style = staticMode
    ? undefined
    : { '--sx': sx, '--hx': hx, '--hy': hy, '--ex': ex, '--life': `${life}s` };
  return (
    <g
      className={staticMode ? '' : `ship-${fate}`}
      transform={staticMode ? `translate(${hx} ${hy})` : undefined}
      style={style}
      onClick={() => onSelect?.(event)}
      cursor={onSelect ? 'pointer' : undefined}
      opacity={staticMode && fate === 'destroyed' ? 0.35 : undefined}
    >
      <title>{`${name}: ${event.method} ${event.path} (${event.actionTaken})`}</title>
      <g transform={`scale(${scale})`}>
        <Saucer severity={event.severity} />
      </g>
      {fate === 'frozen' && (
        <g className={staticMode ? '' : 'appear-late'}>
          <circle r={42 * scale} fill="#7dd3fc" fillOpacity="0.1" stroke="#7dd3fc" strokeOpacity="0.8" strokeDasharray="6 5" />
          {labels && (
            <text y={-46 * scale} textAnchor="middle" className="font-doodle" fontSize="15" fill="#7dd3fc">
              slowed down
            </text>
          )}
        </g>
      )}
      {fate === 'spotted' && (
        <g className={staticMode ? '' : 'appear-late'} stroke="#fbbf24" strokeWidth="2" fill="none">
          {!staticMode && <circle className="ping" r={30 * scale} />}
          <path d={`M${-40 * scale} ${-20 * scale} v-10 h10 M${40 * scale} ${-20 * scale} v-10 h-10 M${-40 * scale} ${18 * scale} v10 h10 M${40 * scale} ${18 * scale} v10 h-10`} />
          {labels && (
            <text y={-36 * scale} textAnchor="middle" className="font-doodle" fontSize="15" fill="#fbbf24" stroke="none">
              spotted!
            </text>
          )}
        </g>
      )}
      {labels && staticMode && fate === 'destroyed' && (
        <text y={-24} textAnchor="middle" className="font-doodle" fontSize="15" fill="#f4f1ea">
          shot down
        </text>
      )}
      {labels && (
        <text y={34 * scale + 8} textAnchor="middle" className="font-doodle" fontSize="15" fill="#b9b4aa">
          {name}
        </text>
      )}
    </g>
  );
}

function Explosion({ item, tip, labels }) {
  const { hx, hy, life } = item;
  const style = { '--life': `${life}s` };
  const pieces = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g style={style} pointerEvents="none">
      <line x1={tip.x} y1={tip.y} x2={hx} y2={hy} stroke="#f4f1ea" strokeLinecap="round" className="laser" />
      <g transform={`translate(${hx} ${hy})`}>
        <g className="boom">
          <circle r="30" fill="#fb923c" fillOpacity="0.55" />
          <circle r="16" fill="#fde68a" />
          <circle r="7" fill="#fff" />
        </g>
        {pieces.map((deg) => (
          <rect
            key={deg}
            className="debris"
            x="-3"
            y="-2"
            width="6"
            height="4"
            rx="1"
            fill={deg % 90 === 0 ? '#d8d3c8' : '#fb923c'}
            style={{ '--dx': `${Math.cos((deg * Math.PI) / 180) * 60}px`, '--dy': `${Math.sin((deg * Math.PI) / 180) * 60}px` }}
          />
        ))}
        {labels && (
          <text className="pop-tag font-doodle" y="-40" textAnchor="middle" fontSize="20" fill="#f4f1ea">
            pew pew! blocked
          </text>
        )}
      </g>
    </g>
  );
}

function Shuttle({ item }) {
  return (
    <g className="shuttle-land" style={{ '--sx': item.sx, '--life': `${item.life}s` }} pointerEvents="none">
      <path d="M0 -10 C6 -10 8 0 8 6 L-8 6 C-8 0 -6 -10 0 -10 Z" fill="#f4f1ea" />
      <circle cy="-2" r="2.5" fill="#60a5fa" />
      <path d="M-3 9 Q0 18 3 9" stroke="#f4f1ea" strokeWidth="2" fill="none" />
    </g>
  );
}

function Backdrop() {
  const stars = useMemo(() => makeStars(45), []);
  return (
    <g aria-hidden="true">
      {stars.map((s) => (
        <circle key={s.id} cx={s.x} cy={s.y} r={s.r} fill="#f4f1ea" className="twinkle" style={{ '--tw': s.tw, '--td': s.td }} />
      ))}

      {/* doodle: ringed planet that draws itself, top right */}
      <g transform="translate(905 70)">
        <g stroke="#85807a" strokeWidth="1.6" fill="none" className="wiggle">
          <circle r="20" pathLength="1" className="draw" />
          <ellipse rx="36" ry="9" transform="rotate(-18)" pathLength="1" className="draw" style={{ animationDelay: '0.5s' }} />
        </g>
      </g>

      {/* doodle: sparkles */}
      {[
        [120, 60],
        [760, 40],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`}
          fill="#f4f1ea"
          className="twinkle"
          style={{ '--tw': `${3 + i}s`, '--td': `${i * 0.7}s` }}
        />
      ))}

      {/* planet = your honeypot */}
      <ellipse cx="500" cy="640" rx="760" ry="290" fill="#0b0b0b" stroke="#2f2f2f" strokeWidth="2" />
    </g>
  );
}

function Base({ angle, pipMood, labels }) {
  return (
    <g>
      {/* dome */}
      <path d="M462 352 A38 38 0 0 1 538 352 Z" fill="#161616" stroke="#3a3a3a" strokeWidth="2" />
      <circle cx="500" cy="340" r="3" fill="#f4f1ea" className="twinkle" style={{ '--tw': '1.6s' }} />
      {/* turret: rotates toward the target */}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${TURRET.x}px ${TURRET.y}px`, transition: 'transform 0.6s ease' }}>
        <rect x={TURRET.x - 5} y={TURRET.y - TURRET.barrel} width="10" height={TURRET.barrel} rx="3" fill="#2a2a2a" stroke="#4a4a4a" />
        <rect x={TURRET.x - 3} y={TURRET.y - TURRET.barrel - 4} width="6" height="6" rx="1.5" fill="#f4f1ea" />
      </g>
      <circle cx={TURRET.x} cy={TURRET.y} r="10" fill="#1f1f1f" stroke="#4a4a4a" />
      {/* Pip operates the turret */}
      <g transform="translate(552 280)">
        <Pip mood={pipMood} size={60} />
      </g>
      {/* doodle label */}
      {labels && (
      <g className="font-doodle" fill="#85807a" fontSize="16">
        <text x="340" y="392">your honeypot (ESP8266)</text>
        <path d="M436 380 q22 -6 30 -22" stroke="#85807a" strokeWidth="1.5" fill="none" pathLength="1" className="draw" />
        <path d="M460 356 l6 2 l2 -6" stroke="#85807a" strokeWidth="1.5" fill="none" />
      </g>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ scene */

/**
 * @param {object[]} events      newest-first events to replay in a loop (home) or a wave to play once (lab)
 * @param {'loop'|'wave'} mode
 * @param {string|number} waveKey change to restart a wave
 * @param {boolean} live         also spawn ships for events arriving over Socket.IO
 * @param {React.ReactNode} overlay  HTML drawn over the scene (e.g. the scoreboard)
 * @param {() => void} onReplay  wave mode: shows a replay button once the wave has played
 * @param {boolean} labels       draw handwritten labels (only readable when the scene is shown large)
 */
export function SpaceScene({ events = [], mode = 'loop', waveKey, live = false, pipMood = 'calm', onSelect, emptyNote, overlay, onReplay, labels = false, className = '' }) {
  const staticMode = prefersReducedMotion();
  const [active, setActive] = useState([]);
  const [angle, setAngle] = useState(0);
  const [waveDone, setWaveDone] = useState(false);
  const seq = useRef(0);
  const timers = useRef(new Set());
  const playlist = useRef([]);
  const cursor = useRef(0);
  const loopTimer = useRef(null);

  // Build what to play: flagged events first, a few friendly shuttles mixed in.
  const items = useMemo(() => {
    const flagged = events.filter((e) => e.classification !== 'normal').slice(0, 10);
    const friendly = events.filter((e) => e.classification === 'normal').slice(0, mode === 'wave' ? 4 : 6);
    if (mode === 'wave') {
      const keep = new Set([...flagged, ...friendly].map((e) => e.id));
      return events.filter((e) => keep.has(e.id));
    }
    const mixed = [];
    const ordered = [...flagged].reverse(); // oldest of the recent first, newest last
    ordered.forEach((e, i) => {
      mixed.push(e);
      if (friendly[i]) mixed.push(friendly[i]);
    });
    return mixed.length ? mixed : friendly;
  }, [events, mode]);

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }

  function spawn(event) {
    const fate = fateOf(event);
    const p = placement(event, seq.current++);
    const life = fate === 'friendly' ? 3 : 4.4;
    const key = `${event.id}-${seq.current}`;
    setActive((list) => [...list.slice(-(MAX_ACTIVE - 1)), { key, event, fate, life, ...p }]);
    if (fate === 'destroyed') {
      const deg = (Math.atan2(p.hx - TURRET.x, TURRET.y - p.hy) * 180) / Math.PI;
      setAngle(Math.max(-75, Math.min(75, deg)));
    }
    later(() => setActive((list) => list.filter((x) => x.key !== key)), life * 1000 + 150);
  }

  // Per-ship removal timers are only cancelled on unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      clearTimeout(loopTimer.current);
    };
  }, []);

  // New data only swaps the playlist; it never interrupts ships already on screen.
  useEffect(() => {
    playlist.current = items;
  }, [items]);

  // Loop mode: replay recent events forever. Wave mode: play once (restarts when waveKey changes).
  useEffect(() => {
    if (staticMode) return undefined;
    const cadence = mode === 'wave' ? 650 : 1700;
    cursor.current = 0;
    setWaveDone(false);
    const tick = () => {
      const list = playlist.current;
      if (!list.length) {
        if (mode === 'loop') loopTimer.current = setTimeout(tick, cadence);
        return;
      }
      if (mode === 'wave' && cursor.current >= list.length) {
        setWaveDone(true);
        return;
      }
      spawn(list[cursor.current % list.length]);
      cursor.current += 1;
      loopTimer.current = setTimeout(tick, cadence);
    };
    loopTimer.current = setTimeout(tick, 300);
    return () => clearTimeout(loopTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, waveKey, staticMode]);

  useSocketEvent(SOCKET_EVENTS.EVENT_NEW, (event) => {
    if (live && !staticMode) spawn(event);
  });

  const staticShips = staticMode
    ? items
        .filter((e) => e.classification !== 'normal')
        .slice(0, 5)
        .map((event, i) => ({ key: event.id, event, fate: fateOf(event), life: 0, ...placement(event, i) }))
    : [];
  const shown = staticMode ? staticShips : active;
  const tip = {
    x: TURRET.x + TURRET.barrel * Math.sin((angle * Math.PI) / 180),
    y: TURRET.y - TURRET.barrel * Math.cos((angle * Math.PI) / 180),
  };
  const mood = active.some((a) => a.fate === 'destroyed' || a.event.severity === 'high' || a.event.severity === 'critical')
    ? 'alert'
    : pipMood;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Defense scene: ${items.filter((e) => e.classification !== 'normal').length} recent flagged requests shown as alien ships; blocked ones are shot down, rate-limited ones frozen, logged ones spotted.`}
      >
        <Backdrop />
        {shown.filter((s) => s.fate === 'friendly').map((s) => (
          <Shuttle key={s.key} item={s} />
        ))}
        {shown.filter((s) => s.fate !== 'friendly').map((s) => (
          <Ship key={s.key} item={s} onSelect={onSelect} staticMode={staticMode} labels={labels} />
        ))}
        {!staticMode && active.filter((s) => s.fate === 'destroyed').map((s) => <Explosion key={`x-${s.key}`} item={s} tip={tip} labels={labels} />)}
        <Base angle={angle} pipMood={mood} labels={labels} />
        {!items.length && emptyNote && (
          <text x="500" y="200" textAnchor="middle" className="font-doodle" fontSize={labels ? 26 : 40} fill="#b9b4aa">
            {emptyNote}
          </text>
        )}
      </svg>
      {overlay}
      {mode === 'wave' && waveDone && onReplay && (
        <button
          type="button"
          onClick={onReplay}
          className="font-doodle absolute right-4 bottom-4 rounded-full border border-line-strong bg-black/70 px-4 py-1.5 text-lg text-accent hover:border-accent"
        >
          ↻ replay wave
        </button>
      )}
    </div>
  );
}
