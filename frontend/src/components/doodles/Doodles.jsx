/**
 * Hand-drawn style sketches (they rise in, then wiggle gently) and handwritten notes. Purely
 * decorative: every one is aria-hidden and never carries information on its own.
 */

const stroke = { stroke: 'currentColor', strokeWidth: 2.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

export function SketchUfo({ className = '' }) {
  return (
    <svg viewBox="0 0 120 70" className={`doodle-in ${className}`} aria-hidden="true">
      <g {...stroke}>
        <path d="M42 34 C44 14 76 14 78 34" />
        <path d="M18 38 C30 28 90 28 102 38 C90 48 30 48 18 38 Z" />
        <path d="M44 50 L36 66 M60 52 L60 68 M76 50 L84 66" />
      </g>
      <g fill="currentColor" className="ship-lights">
        <circle cx="38" cy="39" r="2" />
        <circle cx="60" cy="41" r="2" />
        <circle cx="82" cy="39" r="2" />
      </g>
    </svg>
  );
}

export function SketchRocket({ className = '' }) {
  return (
    <svg viewBox="0 0 80 80" className={`doodle-in ${className}`} aria-hidden="true">
      <g {...stroke} className="wiggle">
        <path d="M40 8 C54 18 56 40 50 56 L30 56 C24 40 26 18 40 8 Z" />
        <circle cx="40" cy="30" r="6" />
        <path d="M30 48 L20 62 L30 58 M50 48 L60 62 L50 58" />
        <path d="M34 60 Q40 76 46 60" />
      </g>
    </svg>
  );
}

export function SketchPlanet({ className = '' }) {
  return (
    <svg viewBox="0 0 90 60" className={`doodle-in ${className}`} aria-hidden="true">
      <g {...stroke}>
        <circle cx="45" cy="30" r="16" />
        <ellipse cx="45" cy="30" rx="38" ry="9" transform="rotate(-15 45 30)" />
      </g>
      <path className="twinkle" fill="currentColor" d="M80 8 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" />
    </svg>
  );
}

/** A short handwritten note, slightly tilted, like a sticky annotation. */
export function Note({ children, className = '' }) {
  return (
    <span className={`font-doodle inline-block -rotate-2 text-accent ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}
