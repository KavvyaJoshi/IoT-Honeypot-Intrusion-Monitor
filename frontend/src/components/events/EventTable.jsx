import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, ExternalLink, FlaskConical } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { CLASSIFICATION_META } from '../../lib/constants.js';
import { describeEvent } from '../../lib/describe.js';
import { formatDateTime, formatTime } from '../../lib/format.js';
import { ActionBadge, SeverityBadge, SourceBadge } from '../ui/Badge.jsx';
import { EventDetails } from './EventDetails.jsx';

const COLUMNS = [
  { key: 'timestamp', label: 'Time', sortable: true },
  { key: 'summary', label: 'What happened', sortable: false },
  { key: 'sourceIdentifier', label: 'Source', sortable: true },
  { key: 'severity', label: 'Severity', sortable: true },
  { key: 'actionTaken', label: 'Outcome', sortable: true },
];

function SortHeader({ column, sort, order, onSort }) {
  if (!column.sortable || !onSort) return <span>{column.label}</span>;
  const active = sort === column.key;
  const Icon = active ? (order === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button type="button" onClick={() => onSort(column.key)} className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}>
      {column.label}
      <Icon className="size-3" aria-hidden="true" />
    </button>
  );
}

function renderCell(key, event) {
  switch (key) {
    case 'timestamp':
      return (
        <time dateTime={event.timestamp} title={formatDateTime(event.timestamp)} className="tabular whitespace-nowrap text-xs text-ink-2">
          {formatTime(event.timestamp)}
        </time>
      );
    case 'summary':
      return (
        <div className="min-w-0 max-w-[420px]">
          <p className="truncate text-sm text-ink" title={describeEvent(event)}>
            {describeEvent(event)}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-3" title={`${event.method} ${event.path}`}>
            {event.method} {event.path}
            {event.responseStatus ? ` → ${event.responseStatus}` : ''}
          </p>
        </div>
      );
    case 'sourceIdentifier':
      return (
        <div className="min-w-0">
          <div className="whitespace-nowrap font-mono text-xs text-ink">{event.sourceIdentifier}</div>
          <div className="mt-1">
            <SourceBadge sourceType={event.sourceType} />
          </div>
        </div>
      );
    case 'severity':
      return <SeverityBadge severity={event.severity} />;
    case 'actionTaken':
      return <ActionBadge action={event.actionTaken} />;
    default:
      return null;
  }
}

/**
 * Event table with five columns. Rows carry a left rail coloured by classification
 * (none / amber / red); simulated rows get a pink tint and badge. Click a row for details.
 */
export function EventTable({ events, sort, order, onSort, expandedId, onToggle, highlightIds }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="text-xs text-ink-3">
          <tr>
            {onToggle && (
              <th scope="col" className="w-10 px-2 py-3">
                <span className="sr-only">Expand</span>
              </th>
            )}
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="whitespace-nowrap px-3 py-3 font-medium"
                aria-sort={sort === column.key ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                <SortHeader column={column} sort={sort} order={order} onSort={onSort} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {events.map((event) => {
            const expanded = expandedId === event.id;
            const rail = CLASSIFICATION_META[event.classification]?.rail ?? 'border-l-transparent';
            return (
              <Fragment key={event.id}>
                <tr
                  className={`border-l-2 ${rail} align-middle transition-colors hover:bg-surface-2/70 ${event.simulated ? 'bg-fuchsia-500/[0.03]' : ''} ${
                    highlightIds?.has(event.id) ? 'row-arrive' : ''
                  } ${onToggle ? 'cursor-pointer' : ''}`}
                  onClick={onToggle ? () => onToggle(event.id) : undefined}
                >
                  {onToggle && (
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Collapse event details' : 'Expand event details'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(event.id);
                        }}
                        className="rounded p-1 text-ink-3 hover:text-ink"
                      >
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </td>
                  )}
                  {COLUMNS.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {renderCell(column.key, event)}
                    </td>
                  ))}
                </tr>
                {expanded && (
                  <tr className="bg-canvas/50">
                    <td colSpan={COLUMNS.length + 1} className="px-4 py-5 sm:px-8">
                      {event.simulated && (
                        <p className="mb-4 inline-flex items-center gap-1.5 text-xs text-fuchsia-300">
                          <FlaskConical className="size-3.5" aria-hidden="true" /> Simulated practice traffic, not a real attack
                        </p>
                      )}
                      <EventDetails event={event} compact />
                      <Link
                        to={`/events/${event.id}`}
                        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:text-accent"
                      >
                        Open full details
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
