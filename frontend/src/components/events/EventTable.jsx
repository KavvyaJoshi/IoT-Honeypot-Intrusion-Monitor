import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, ExternalLink } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { CLASSIFICATION_META } from '../../lib/constants.js';
import { formatDateTime, formatTime } from '../../lib/format.js';
import { ActionBadge, categoryLabel, SeverityBadge, SourceBadge } from '../ui/Badge.jsx';
import { EventDetails } from './EventDetails.jsx';

const COLUMNS = [
  { key: 'timestamp', label: 'Time', sortable: true },
  { key: 'sourceIdentifier', label: 'Source', sortable: true },
  { key: 'sourceType', label: 'Origin', sortable: true },
  { key: 'method', label: 'Method', sortable: true },
  { key: 'path', label: 'Path', sortable: true },
  { key: 'category', label: 'Detection', sortable: true },
  { key: 'severity', label: 'Severity', sortable: true },
  { key: 'actionTaken', label: 'Action', sortable: true },
  { key: 'reason', label: 'Reason', sortable: false },
];

function SortHeader({ column, sort, order, onSort }) {
  if (!column.sortable || !onSort) {
    return <span>{column.label}</span>;
  }
  const active = sort === column.key;
  const Icon = active ? (order === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}
    >
      {column.label}
      <Icon className="size-3" aria-hidden="true" />
    </button>
  );
}

function summary(event) {
  if (!event.detectionReasons?.length) return 'No rule matched';
  return event.detectionReasons[0];
}

/**
 * Security event table. Rows carry a left rail coloured by classification (none / amber /
 * red), a source badge (ESP8266 / Simulated / Backend) and severity/action badges with icons.
 */
export function EventTable({ events, sort, order, onSort, expandedId, onToggle, highlightIds, compact = false }) {
  const columns = compact ? COLUMNS.filter((c) => !['method', 'reason', 'sourceType'].includes(c.key)) : COLUMNS;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line text-xs text-ink-3">
          <tr>
            {onToggle && <th scope="col" className="w-8 px-2 py-2.5"><span className="sr-only">Expand</span></th>}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="whitespace-nowrap px-3 py-2.5 font-medium"
                aria-sort={sort === column.key ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                <SortHeader column={column} sort={sort} order={order} onSort={onSort} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {events.map((event) => {
            const expanded = expandedId === event.id;
            const rail = CLASSIFICATION_META[event.classification]?.rail ?? 'border-l-transparent';
            return (
              <Fragment key={event.id}>
                <tr
                  className={`border-l-2 ${rail} align-top transition-colors hover:bg-surface-2/70 ${
                    event.simulated ? 'bg-violet-500/[0.035]' : ''
                  } ${highlightIds?.has(event.id) ? 'row-arrive' : ''} ${onToggle ? 'cursor-pointer' : ''}`}
                  onClick={onToggle ? () => onToggle(event.id) : undefined}
                >
                  {onToggle && (
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Collapse event details' : 'Expand event details'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(event.id);
                        }}
                        className="rounded p-0.5 text-ink-3 hover:text-ink"
                      >
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-2.5">
                      {renderCell(column.key, event, compact)}
                    </td>
                  ))}
                </tr>
                {expanded && (
                  <tr className="bg-canvas/60">
                    <td colSpan={columns.length + 1} className="px-4 py-4 sm:px-6">
                      <EventDetails event={event} compact />
                      <Link
                        to={`/events/${event.id}`}
                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-sky-300 hover:text-sky-200"
                      >
                        Open full event record
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

function renderCell(key, event, compact) {
  switch (key) {
    case 'timestamp':
      return (
        <time dateTime={event.timestamp} title={formatDateTime(event.timestamp)} className="tabular whitespace-nowrap text-xs text-ink-2">
          {formatTime(event.timestamp)}
        </time>
      );
    case 'sourceIdentifier':
      return (
        <div className="min-w-0">
          <div className="whitespace-nowrap font-mono text-xs text-ink">{event.sourceIdentifier}</div>
          {event.deviceId && <div className="truncate text-[11px] text-ink-3">{event.deviceId}</div>}
          {compact && (
            <div className="mt-1">
              <SourceBadge sourceType={event.sourceType} />
            </div>
          )}
        </div>
      );
    case 'sourceType':
      return <SourceBadge sourceType={event.sourceType} />;
    case 'method':
      return <span className="font-mono text-xs text-ink-2">{event.method}</span>;
    case 'path':
      return (
        <div className="max-w-[260px]">
          <span className="block truncate font-mono text-xs text-ink" title={event.path}>
            {compact && `${event.method} `}
            {event.path}
          </span>
          {event.responseStatus && <span className="text-[11px] text-ink-3">HTTP {event.responseStatus}</span>}
        </div>
      );
    case 'category':
      return <span className="whitespace-nowrap text-xs text-ink-2">{categoryLabel(event.category)}</span>;
    case 'severity':
      return <SeverityBadge severity={event.severity} />;
    case 'actionTaken':
      return <ActionBadge action={event.actionTaken} />;
    case 'reason':
      return (
        <p className="line-clamp-2 max-w-[340px] text-xs text-ink-3" title={summary(event)}>
          {summary(event)}
        </p>
      );
    default:
      return null;
  }
}
