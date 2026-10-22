import { Link } from 'react-router';
import { CHART_COLORS } from '../../lib/constants.js';
import { formatNumber } from '../../lib/format.js';

/**
 * Ranked horizontal bars with the label and value always visible (no hover needed).
 * One colour for all rows unless a row carries its own semantic colour (e.g. severity).
 */
export function BarList({ items, emptyLabel = 'No data in this range' }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-ink-3">{emptyLabel}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const Icon = item.icon;
        const label = (
          <span className="flex min-w-0 items-center gap-1.5">
            {Icon && <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />}
            <span className={`truncate ${item.mono ? 'font-mono text-xs' : ''}`} title={item.title ?? item.label}>
              {item.label}
            </span>
          </span>
        );
        return (
          <li key={item.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm text-ink-2">
              {item.to ? (
                <Link to={item.to} className="min-w-0 hover:text-ink hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="tabular shrink-0 text-xs font-medium text-ink">
                {formatNumber(item.value)}
                {item.secondary && <span className="ml-1.5 font-normal text-ink-3">{item.secondary}</span>}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3/60">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${item.value === 0 ? 0 : Math.max((item.value / max) * 100, 1.5)}%`,
                  backgroundColor: item.color ?? CHART_COLORS.single,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
