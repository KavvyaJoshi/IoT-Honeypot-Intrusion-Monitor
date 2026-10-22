import { Pause, Play, SlidersHorizontal } from 'lucide-react';
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
import { useMissions } from '../game/MissionsContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDebouncedValue, useSocketEvent, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { CATEGORY_LABELS, RANGE_OPTIONS } from '../lib/constants.js';
import { formatNumber } from '../lib/format.js';

const FILTER_KEYS = ['search', 'severity', 'category', 'classification', 'sourceType', 'actionTaken', 'deviceId', 'range'];
const PRESET_KEYS = ['severity', 'classification', 'sourceType', 'actionTaken'];

/** One-click presets for the most common questions. */
const PRESETS = [
  { id: 'all', label: 'Everything', params: {} },
  { id: 'alerts', label: 'Alerts', params: { classification: 'suspicious,high-risk' } },
  { id: 'high', label: 'High risk', params: { severity: 'high,critical' } },
  { id: 'enforced', label: 'Blocked or slowed', params: { actionTaken: 'rate-limited,blocked' } },
  { id: 'device', label: 'From ESP8266', params: { sourceType: 'device' } },
  { id: 'simulated', label: 'Simulated', params: { sourceType: 'simulator' } },
];

const options = (all, entries) => [{ value: '', label: all }, ...entries];
const SEVERITY_OPTIONS = options('Any severity', ['critical', 'high', 'medium', 'low', 'info'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })));
const CATEGORY_OPTIONS = options('Any category', Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })));
const SOURCE_OPTIONS = options('Any source', [
  { value: 'device', label: 'ESP8266 device' },
  { value: 'simulator', label: 'Simulator' },
  { value: 'backend', label: 'Backend (API 429)' },
]);
const ACTION_OPTIONS = options('Any outcome', [
  { value: 'allowed', label: 'Allowed' },
  { value: 'logged', label: 'Logged' },
  { value: 'rate-limited', label: 'Rate-limited' },
  { value: 'blocked', label: 'Blocked' },
]);
const TIME_OPTIONS = [...RANGE_OPTIONS.filter((r) => r.value !== 'all').map((r) => ({ ...r, label: `Last ${r.label}` })), { value: 'all', label: 'All time' }];

export default function EventsPage() {
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchText, 350);
  const [showFilters, setShowFilters] = useState(() => Boolean(params.get('category') || params.get('range') || params.get('deviceId')));
  const [live, setLive] = useState(true);
  const [pending, setPending] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [highlightIds, setHighlightIds] = useState(() => new Set());
  const previousIds = useRef(null);
  const trackArrivals = useRef(false);
  const { recordAction } = useMissions();

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

  function applyPreset(preset) {
    const changes = Object.fromEntries(PRESET_KEYS.map((key) => [key, preset.params[key] ?? '']));
    update(changes);
  }

  const activePreset = PRESETS.find((preset) => PRESET_KEYS.every((key) => (params.get(key) ?? '') === (preset.params[key] ?? '')));

  useEffect(() => {
    if (debouncedSearch !== (params.get('search') ?? '')) update({ search: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

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

  function toggleRow(id) {
    setExpandedId((current) => (current === id ? null : id));
    const event = events.data?.data.find((e) => e.id === id);
    if (event && event.classification !== 'normal') recordAction('investigate');
  }

  const advancedCount = ['category', 'range', 'deviceId'].filter((key) => params.get(key)).length;
  const anyFilter = FILTER_KEYS.some((key) => params.get(key));

  return (
    <>
      <PageHeader
        title="Events"
        description="Everything the honeypot saw, newest first. Click a row to see why it was flagged."
        actions={
          <Button size="sm" variant="ghost" icon={live ? Pause : Play} onClick={() => setLive((v) => !v)}>
            {live ? 'Pause live' : 'Resume live'}
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            className="w-full sm:w-80"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search a page, IP or device…"
            label="Search events by path or source"
          />
          <Button size="sm" variant="ghost" icon={SlidersHorizontal} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            More filters{advancedCount ? ` (${advancedCount})` : ''}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
          {PRESETS.map((preset) => {
            const active = activePreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => applyPreset(preset)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  active ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {showFilters && (
          <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <SelectField label="Severity" value={params.get('severity') ?? ''} onChange={(v) => update({ severity: v })} options={SEVERITY_OPTIONS} />
            <SelectField label="Category" value={params.get('category') ?? ''} onChange={(v) => update({ category: v })} options={CATEGORY_OPTIONS} />
            <SelectField label="Source" value={params.get('sourceType') ?? ''} onChange={(v) => update({ sourceType: v })} options={SOURCE_OPTIONS} />
            <SelectField label="Outcome" value={params.get('actionTaken') ?? ''} onChange={(v) => update({ actionTaken: v })} options={ACTION_OPTIONS} />
            <SelectField label="Time" value={params.get('range') ?? 'all'} onChange={(v) => update({ range: v === 'all' ? '' : v })} options={TIME_OPTIONS} />
            {params.get('deviceId') && (
              <p className="text-xs text-ink-3 sm:col-span-2 lg:col-span-5">
                Device: <span className="font-mono text-ink-2">{params.get('deviceId')}</span>
              </p>
            )}
          </Card>
        )}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-ink-3">
          <span>{events.data ? `${formatNumber(events.data.pagination.total)} events` : 'Loading events…'}</span>
          <span className="inline-flex items-center gap-3">
            {anyFilter && (
              <button
                type="button"
                className="text-accent-ink hover:text-accent"
                onClick={() => {
                  setSearchText('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear filters
              </button>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${isLiveView ? 'bg-emerald-400' : 'bg-slate-500'}`} aria-hidden="true" />
              {isLiveView ? 'Live' : live ? 'Live on page 1 (newest first)' : 'Paused'}
            </span>
          </span>
        </div>
        {pending > 0 && (
          <button
            type="button"
            onClick={refreshNow}
            className="w-full border-t border-line bg-accent/10 px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent/15"
          >
            {pending} new event{pending === 1 ? '' : 's'}. Click to show them.
          </button>
        )}
        <AsyncContent
          state={events}
          isEmpty={(data) => data.data.length === 0}
          empty={
            <EmptyState
              title={anyFilter ? 'No events match these filters' : 'No events recorded yet'}
              description={
                anyFilter
                  ? 'Try "Everything" or a longer time range.'
                  : 'Events appear here when the ESP8266 reports a request or when you run a scenario in the Practice lab.'
              }
            />
          }
        >
          {(data) => (
            <>
              <EventTable events={data.data} sort={sort} order={order} onSort={onSort} expandedId={expandedId} onToggle={toggleRow} highlightIds={highlightIds} />
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
