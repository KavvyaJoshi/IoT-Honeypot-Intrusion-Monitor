import { ChevronRight, FlaskConical } from 'lucide-react';
import { Link } from 'react-router';
import { SEVERITY_META } from '../../lib/constants.js';
import { describeEvent } from '../../lib/describe.js';
import { formatDateTime, formatRelative } from '../../lib/format.js';
import { ActionBadge } from '../ui/Badge.jsx';

const ICON_TONE = {
  info: 'bg-slate-500/15 text-slate-300',
  low: 'bg-sky-500/15 text-sky-300',
  medium: 'bg-amber-500/15 text-amber-300',
  high: 'bg-red-500/15 text-red-300',
  critical: 'bg-rose-600/25 text-rose-200',
};

/**
 * Collapses back-to-back events with the same category and source into one entry with a
 * count, so a burst of 6 identical alerts reads as one line ("×6") instead of six.
 */
export function groupAlerts(events, max = 6) {
  const groups = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (last && last.event.category === event.category && last.event.sourceIdentifier === event.sourceIdentifier) {
      last.count += 1;
    } else {
      groups.push({ event, count: 1 });
    }
  }
  return groups.slice(0, max);
}

/** One event as a readable sentence: what happened, who, when, and what the system did. */
export function AlertRow({ event, now, count = 1 }) {
  const meta = SEVERITY_META[event.severity] ?? SEVERITY_META.info;
  const Icon = meta.icon;
  return (
    <li>
      <Link
        to={`/events/${event.id}`}
        className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2"
      >
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${ICON_TONE[event.severity]}`} title={`${meta.label} severity`}>
          <Icon className="size-[18px]" aria-hidden="true" />
          <span className="sr-only">{meta.label} severity</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{describeEvent(event)}</span>
            {count > 1 && (
              <span className="shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-2" title={`${count} similar events in a row`}>
                ×{count}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
            <span className="font-mono">{event.sourceIdentifier}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={event.timestamp} title={formatDateTime(event.timestamp)}>
              {formatRelative(event.timestamp, now)}
            </time>
            {event.simulated && (
              <span className="inline-flex items-center gap-1 text-fuchsia-300">
                <FlaskConical className="size-3" aria-hidden="true" /> simulated
              </span>
            )}
          </span>
        </span>
        <span className="hidden shrink-0 sm:block">
          <ActionBadge action={event.actionTaken} />
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}
