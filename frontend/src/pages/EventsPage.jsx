import { FilterX, ListFilter, Pause, Play, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { EventTable } from '../components/events/EventTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, PageHeader } from '../components/ui/Card.jsx';
import { SearchInput, SelectField } from '../components/ui/Controls.jsx';
import { Pagination } from '../components/ui/Pagination.jsx';
import { AsyncContent, EmptyState } from '../components/ui/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDebouncedValue, useSocketEvent, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { CATEGORY_LABELS, RANGE_OPTIONS } from '../lib/constants.js';
import { formatNumber } from '../lib/format.js';

const FILTER_KEYS = ['search', 'severity', 'category', 'classification', 'sourceType', 'actionTaken', 'deviceId', 'range'];

const options = (all, entries) => [{ value: '', label: all }, ...entries];

const SEVERITY_OPTIONS = options('All severities', [
  { value: 'high,critical', label: 'High + critical' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info (normal)' },
]);
const CATEGORY_OPTIONS = options('All categories', Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })));
const CLASSIFICATION_OPTIONS = options('All classifications', [
  { value: 'normal', label: 'Normal' },
  { value: 'suspicious,high-risk', label: 'Suspicious + high risk' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'high-risk', label: 'High risk' },
]);
const SOURCE_OPTIONS = options('All sources', [
  { value: 'device', label: 'ESP8266 device' },
  { value: 'simulator', label: 'Simulator' },
  { value: 'backend', label: 'Backend (API 429)' },
]);
const ACTION_OPTIONS = options('All actions', [
  { value: 'allowed', label: 'Allowed' },
  { value: 'logged', label: 'Logged' },
  { value: 'rate-limited', label: 'Rate-limited' },
  { value: 'blocked', label: 'Blocked' },
]);
const TIME_OPTIONS = [...RANGE_OPTIONS.filter((r) => r.value !== 'all').map((r) => ({ ...r, label: `Last ${r.label}` })), { value: 'all', label: 'All recorded' }];

export default function EventsPage() {
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchText, 350);
  const [live, setLive] = useState(true);
  const [pending, setPending] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [highlightIds, setHighlightIds] = useState(() => new Set());
  const previousIds = useRef(null);
  const trackArrivals = useRef(false);

  const page = Number(params.get('page') ?? 1) || 1;
  const sort = params.get('sort') ?? 'timestamp';
  const order = params.get('order') ?? 'desc';
  const query = { page, limit: 25, sort, order };
  for (const key of FILTER_KEYS) if (params.get(key)) query[key] = params.get(key);
  const queryKey = JSON.stringify(query);

  const events = useApi(() => api.events(query), [queryKey]);
  const isLiveView = live && page === 1 && sort === 'timestamp' && order === 'desc';

  function update(changes, { resetPage = true } = {}) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (debouncedSearch !== (params.get('search') ?? '')) update({ search: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Highlight rows that arrived through a live refresh.
  useEffect(() => {
    const ids = events.data?.data.map((e) => e.id);
    if (!ids) return undefined;
    let timer;
    if (trackArrivals.current && previousIds.current) {
      const fresh = new Set(ids.filter((id) => !previousIds.current.has(id)));
      if (fresh.size) {
        setHighlightIds(fresh);
        timer = setTimeout(() => setHighlightIds(new Set()), 2500);
      }
    }
    trackArrivals.current = false;
    previousIds.current = new Set(ids);
    return () => clearTimeout(timer);
  }, [events.data]);

  useThrottledSocketRefresh([SOCKET_EVENTS.EVENT_NEW, SOCKET_EVENTS.SIMULATOR_RESET], () => {
    if (isLiveView) {
      trackArrivals.current = true;
      events.refetch();
    }
  });
  useSocketEvent(SOCKET_EVENTS.EVENT_NEW, () => {
    if (!isLiveView) setPending((n) => n + 1);
  });

  function refreshNow() {
    setPending(0);
    events.refetch();
  }

  function onSort(key) {
    const nextOrder = sort === key && order === 'desc' ? 'asc' : 'desc';
    update({ sort: key === 'timestamp' && nextOrder === 'desc' ? '' : key, order: nextOrder === 'desc' ? '' : nextOrder });
  }

  const activeFilters = FILTER_KEYS.filter((key) => params.get(key)).length;

  return (
    <>
      <PageHeader
        title="Security events"
        description="Every request reported by the ESP8266 or generated by the simulator, with the detection engine's classification. Click a row for details."
        actions={
          <>
            <Button size="sm" variant={live ? 'secondary' : 'ghost'} icon={live ? Pause : Play} onClick={() => setLive((v) => !v)}>
              {live ? 'Pause live updates' : 'Resume live updates'}
            </Button>
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refreshNow} loading={events.refreshing}>
              Refresh
            </Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <SearchInput
            className="sm:col-span-2"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search path, source IP or device"
            label="Search events by path or source"
          />
          <SelectField label="Severity" hideLabel value={params.get('severity') ?? ''} onChange={(v) => update({ severity: v })} options={SEVERITY_OPTIONS} />
          <SelectField label="Category" hideLabel value={params.get('category') ?? ''} onChange={(v) => update({ category: v })} options={CATEGORY_OPTIONS} />
          <SelectField
            label="Classification"
            hideLabel
            value={params.get('classification') ?? ''}
            onChange={(v) => update({ classification: v })}
            options={CLASSIFICATION_OPTIONS}
          />
          <SelectField label="Source" hideLabel value={params.get('sourceType') ?? ''} onChange={(v) => update({ sourceType: v })} options={SOURCE_OPTIONS} />
          <SelectField label="Action" hideLabel value={params.get('actionTaken') ?? ''} onChange={(v) => update({ actionTaken: v })} options={ACTION_OPTIONS} />
          <SelectField label="Time range" hideLabel value={params.get('range') ?? 'all'} onChange={(v) => update({ range: v === 'all' ? '' : v })} options={TIME_OPTIONS} />
        </div>
        {(activeFilters > 0 || params.get('deviceId')) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            {params.get('deviceId') && (
              <span className="rounded bg-surface-3 px-2 py-1 text-ink-2">
                Device: <span className="font-mono">{params.get('deviceId')}</span>
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={FilterX}
              onClick={() => {
                setSearchText('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-3">
          <span className="inline-flex items-center gap-2">
            <ListFilter className="size-3.5" aria-hidden="true" />
            {events.data ? `${formatNumber(events.data.pagination.total)} matching events` : 'Loading events'}
          </span>
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0.5 rounded bg-amber-400" aria-hidden="true" /> suspicious
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0.5 rounded bg-red-500" aria-hidden="true" /> high risk
            </span>
            <span>{isLiveView ? 'Live' : live ? 'Live updates apply on page 1, newest first' : 'Paused'}</span>
          </span>
        </div>
        {pending > 0 && (
          <button
            type="button"
            onClick={refreshNow}
            className="w-full border-b border-line bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/15"
          >
            {pending} new event{pending === 1 ? '' : 's'} received. Click to refresh.
          </button>
        )}
        <AsyncContent
          state={events}
          isEmpty={(data) => data.data.length === 0}
          empty={
            <EmptyState
              title={activeFilters ? 'No events match these filters' : 'No events recorded yet'}
              description={
                activeFilters
                  ? 'Try widening the time range or clearing filters.'
                  : 'Events appear here when the ESP8266 reports a request or when you run a scenario on the Controlled testing page.'
              }
            />
          }
        >
          {(data) => (
            <>
              <EventTable
                events={data.data}
                sort={sort}
                order={order}
                onSort={onSort}
                expandedId={expandedId}
                onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
                highlightIds={highlightIds}
              />
              <Pagination
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                total={data.pagination.total}
                limit={data.pagination.limit}
                onPageChange={(next) => update({ page: next === 1 ? '' : next }, { resetPage: false })}
              />
            </>
          )}
        </AsyncContent>
      </Card>
    </>
  );
}
