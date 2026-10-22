import { Activity, ArrowRight, Cpu, FlaskConical, Gauge, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Pip } from '../components/mascot/Pip.jsx';
import { useMascot } from '../components/mascot/useMascot.js';
import { StatusIndicator } from '../components/ui/Badge.jsx';
import { CountUp } from '../components/ui/CountUp.jsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { ChartCard, DataTable } from '../components/charts/ChartCard.jsx';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart.jsx';
import { AlertRow, groupAlerts } from '../components/events/AlertRow.jsx';
import { Card } from '../components/ui/Card.jsx';
import { SegmentedControl } from '../components/ui/Controls.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';
import { AsyncContent, EmptyState, Skeleton } from '../components/ui/States.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { RankCard } from '../game/GameWidgets.jsx';
import { useMissions } from '../game/MissionsContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useNow, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { CHART_COLORS } from '../lib/constants.js';
import { formatBucketRange, formatNumber } from '../lib/format.js';

const RANGES = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];
const RANGE_WORDS = { '1h': 'in the last hour', '24h': 'in the last 24 hours', '7d': 'in the last 7 days' };

const TIMELINE_SERIES = [
  { key: 'total', label: 'All requests', color: CHART_COLORS.total, type: 'area' },
  { key: 'suspicious', label: 'Alerts', color: CHART_COLORS.flagged, type: 'line' },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The one-sentence answer to "is everything OK?". */
function Headline({ totals, range }) {
  const mascot = useMascot();
  const alerts = totals.suspicious;
  const high = totals.highSeverity;
  let tone = { status: 'ok', label: 'Status: clear', title: 'All quiet.', text: `No alerts ${RANGE_WORDS[range]}. Pip is keeping watch.` };
  if (high > 0) {
    tone = {
      status: 'down',
      label: 'Status: high risk',
      title: `${high} high-risk alert${high === 1 ? '' : 's'} need a look.`,
      text: `${alerts} alert${alerts === 1 ? '' : 's'} in total ${RANGE_WORDS[range]}.`,
    };
  } else if (alerts > 0) {
    tone = {
      status: 'degraded',
      label: 'Status: review',
      title: `${alerts} thing${alerts === 1 ? '' : 's'} worth a look.`,
      text: `Nothing high-risk ${RANGE_WORDS[range]}.`,
    };
  }
  const mood = mascot.mood === 'sleep' || mascot.mood === 'party' ? mascot.mood : high > 0 || mascot.mood === 'alert' ? 'alert' : 'calm';
  return (
    <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative grid size-28 shrink-0 place-items-center sm:size-36">
        {/* radar sweep behind Pip */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="none" stroke="#2a2a2a" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="#1f1f1f" />
          <g className="radar-sweep">
            <path d="M50 50 L50 2 A48 48 0 0 1 84 16 Z" fill={mood === 'alert' ? '#ff5d5d' : '#c8f135'} opacity="0.1" />
          </g>
        </svg>
        <Pip mood={mood} size={96} className="relative h-auto w-20 sm:w-24" />
      </div>
      <div className="min-w-0 flex-1">
        <StatusIndicator status={tone.status} label={tone.label} className="font-mono uppercase tracking-wider" />
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-4xl">{tone.title}</h2>
        <p className="mt-2 text-ink-2">
          {tone.text} <CountUp value={totals.total} /> request{totals.total === 1 ? '' : 's'} checked.
        </p>
      </div>
      {alerts > 0 && (
        <Link
          to="/events?classification=suspicious,high-risk"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-ink"
        >
          Review alerts <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** First-run guide shown until the first event exists. */
function GettingStarted() {
  const { isAdmin, openAdminDialog } = useSystem();
  const steps = [
    {
      icon: KeyRound,
      title: 'Unlock admin',
      text: 'Paste the ADMIN_TOKEN from backend/.env so you can run practice scenarios.',
      action: isAdmin ? <span className="text-sm text-emerald-300">Done</span> : (
        <button type="button" onClick={openAdminDialog} className="text-sm font-medium text-accent-ink hover:text-accent">
          Unlock →
        </button>
      ),
    },
    {
      icon: FlaskConical,
      title: 'Run a practice scenario',
      text: 'Generate clearly labelled simulated traffic and watch the rules react.',
      action: (
        <Link to="/lab" className="text-sm font-medium text-accent-ink hover:text-accent">
          Open Practice lab →
        </Link>
      ),
    },
    {
      icon: Cpu,
      title: 'Connect your ESP8266',
      text: 'Optional. Flash the firmware and real device traffic appears here.',
      action: (
        <Link to="/devices" className="text-sm font-medium text-accent-ink hover:text-accent">
          Setup guide →
        </Link>
      ),
    },
  ];
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Welcome! Let's catch your first signal.</h2>
      <p className="mt-1 text-ink-2">Nothing has been recorded yet. Three quick steps:</p>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="rounded-xl border border-line bg-surface-2/60 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent-ink">{i + 1}</span>
                <Icon className="size-5 text-ink-3" aria-hidden="true" />
              </div>
              <p className="mt-3 font-medium text-ink">{step.title}</p>
              <p className="mt-1 text-sm text-ink-2">{step.text}</p>
              <div className="mt-3">{step.action}</div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function NextMissions() {
  const { missions } = useMissions();
  const next = missions.filter((m) => !m.done).slice(0, 3);
  return (
    <Card className="p-5">
      <RankCard compact />
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{next.length ? 'Next missions' : 'All missions complete'}</p>
        <ul className="mt-2 space-y-2">
          {next.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.id} className="flex items-center gap-3 text-sm">
                <Icon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-ink-2">{m.title}</span>
                <span className="font-mono text-xs font-semibold text-accent">+{m.xp}</span>
              </li>
            );
          })}
        </ul>
        <Link to="/lab" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:text-accent">
          Go to Practice lab <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState('1h');
  const now = useNow(15000);

  const stats = useApi(() => api.eventStats({ range }), [range], { refreshInterval: 30000 });
  const alerts = useApi(() => api.events({ limit: 40, classification: 'suspicious,high-risk' }), []);
  const anyEvents = useApi(() => api.events({ limit: 1 }), []);

  useThrottledSocketRefresh([SOCKET_EVENTS.EVENT_NEW, SOCKET_EVENTS.SIMULATOR_RESET], () => {
    stats.refetch();
    alerts.refetch();
    anyEvents.refetch();
  });

  const totals = stats.data?.totals;
  const firstRun = anyEvents.data && anyEvents.data.pagination.total === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-3">{greeting()}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Home</h1>
        </div>
        {!firstRun && <SegmentedControl label="Time range" options={RANGES} value={range} onChange={setRange} />}
      </div>

      {firstRun ? (
        <GettingStarted />
      ) : (
        <>
          <Card className="dot-grid p-6 sm:p-8">
            {totals ? (
              <Headline totals={totals} range={range} />
            ) : stats.error ? (
              <p role="alert" className="text-ink-2">
                {stats.error.message}
              </p>
            ) : (
              <div className="flex items-center gap-5">
                <Skeleton className="size-16 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-7 w-64" />
                  <Skeleton className="h-4 w-80" />
                </div>
              </div>
            )}
          </Card>

          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Requests checked" icon={Activity} tone="info" loading={stats.loading} value={totals?.total} hint={`${formatNumber(totals?.device)} from ESP8266 · ${formatNumber(totals?.simulated)} simulated`} to="/events" />
            <StatCard label="Alerts" icon={TriangleAlert} tone="warn" loading={stats.loading} value={totals?.suspicious} hint={`${formatNumber(totals?.highSeverity)} high-risk`} to="/events?classification=suspicious,high-risk" />
            <StatCard label="Slowed or blocked now" icon={Gauge} tone="orange" loading={stats.loading} value={totals?.activeEnforcements} hint="Sources under a temporary limit" to="/rules" />
          </div>
        </>
      )}

      <div className="stagger grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h2 className="font-semibold text-ink">Latest alerts</h2>
              <p className="text-sm text-ink-3">Newest first, updates live</p>
            </div>
            <Link to="/events?classification=suspicious,high-risk" className="text-sm font-medium text-accent-ink hover:text-accent">
              See all
            </Link>
          </div>
          <div className="p-2">
            <AsyncContent
              state={alerts}
              isEmpty={(data) => data.data.length === 0}
              empty={<EmptyState compact icon={ShieldCheck} title="No alerts yet" description="When a rule flags something, it shows up here in plain language." />}
            >
              {(data) => (
                <ul>
                  {groupAlerts(data.data).map(({ event, count }) => (
                    <AlertRow key={event.id} event={event} count={count} now={now} />
                  ))}
                </ul>
              )}
            </AsyncContent>
          </div>
        </Card>
        <NextMissions />
      </div>

      {!firstRun && (
        <ChartCard
          title="Activity"
          subtitle="Requests and alerts over time"
          icon={Activity}
          state={stats}
          isEmpty={(data) => data.totals.total === 0}
          empty={<EmptyState compact title={`No requests ${RANGE_WORDS[range]}`} description="Try a longer time range." />}
          renderChart={(data) => <TimeSeriesChart data={data.timeline} series={TIMELINE_SERIES} bucketMs={data.bucketMs} height={200} />}
          renderTable={(data) => (
            <DataTable
              columns={[
                { key: 't', label: 'Interval', render: (row) => formatBucketRange(row.t, data.bucketMs) },
                { key: 'total', label: 'Requests', align: 'right' },
                { key: 'suspicious', label: 'Alerts', align: 'right' },
              ]}
              rows={[...data.timeline].reverse()}
            />
          )}
        />
      )}
    </div>
  );
}
