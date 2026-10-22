import { Link } from 'react-router';
import { Skeleton } from './States.jsx';

const TONES = {
  neutral: 'text-ink-3',
  info: 'text-sky-300',
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  danger: 'text-red-300',
  orange: 'text-orange-300',
};

/** KPI tile: label, a large proportional-figure value and a supporting hint. */
export function StatCard({ label, value, icon: Icon, tone = 'neutral', hint, loading = false, to }) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
        {Icon && <Icon className={`size-4 shrink-0 ${TONES[tone]}`} aria-hidden="true" />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className="mt-1.5 text-2xl font-semibold text-ink">{value}</div>
      )}
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </>
  );

  const className = 'block rounded-lg border border-line bg-surface p-4';
  if (to) {
    return (
      <Link to={to} className={`${className} transition-colors hover:border-line-strong hover:bg-surface-2`}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
