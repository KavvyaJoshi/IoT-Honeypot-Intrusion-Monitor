import { Link } from 'react-router';
import { CountUp } from './CountUp.jsx';
import { Skeleton } from './States.jsx';

const TONES = {
  neutral: 'text-ink-3',
  info: 'text-sky-300',
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  danger: 'text-red-300',
  orange: 'text-orange-300',
  accent: 'text-accent',
};

/** KPI tile: a mono label, a large value (numbers count up) and one line of context. */
export function StatCard({ label, value, icon: Icon, tone = 'neutral', hint, loading = false, to }) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="label">{label}</p>
        {Icon && <Icon className={`size-4 shrink-0 ${TONES[tone]}`} aria-hidden="true" />}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-20" />
      ) : (
        <div className="mt-2 text-4xl font-semibold tracking-tight text-ink">
          {typeof value === 'number' ? <CountUp value={value} /> : value ?? '—'}
        </div>
      )}
      {hint && <div className="mt-1.5 text-sm text-ink-3">{hint}</div>}
    </>
  );

  const className = 'block rounded-xl border border-line bg-surface p-5';
  if (to) {
    return (
      <Link to={to} className={`${className} lift hover:border-line-strong hover:bg-surface-2`}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
