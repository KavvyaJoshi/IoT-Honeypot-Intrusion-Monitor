import { ArrowRight, Cpu, FlaskConical, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { SketchUfo } from '../components/doodles/Doodles.jsx';
import { AlertRow, groupAlerts } from '../components/events/AlertRow.jsx';
import { useMascot } from '../components/mascot/useMascot.js';
import { SpaceScene } from '../components/space/SpaceScene.jsx';
import { SegmentedControl } from '../components/ui/Controls.jsx';
import { CountUp } from '../components/ui/CountUp.jsx';
import { AsyncContent } from '../components/ui/States.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { RankCard } from '../game/GameWidgets.jsx';
import { useMissions } from '../game/MissionsContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useNow, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { formatNumber } from '../lib/format.js';

const RANGES = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];
const RANGE_WORDS = { '1h': 'Last hour', '24h': 'Last 24 hours', '7d': 'Last 7 days' };

/** Scoreboard: what happened to the invaders, in the scene's own colours. */
const SCORE = [
  { action: 'blocked', label: 'Shot down', dot: 'bg-accent' },
  { action: 'rate-limited', label: 'Frozen', dot: 'bg-sky-300' },
  { action: 'logged', label: 'Spotted', dot: 'bg-amber-300' },
  { action: 'allowed', label: 'Landed safely', dot: 'bg-ink-2' },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning, commander';
  if (hour < 18) return 'Good afternoon, commander';
  return 'Good evening, commander';
}

function headlineFor(totals) {
  if (!totals) return 'Scanning your sector…';
  const flagged = totals.suspicious;
  const high = totals.highSeverity;
  if (high > 0) return `${high} high-risk invader${high === 1 ? '' : 's'} need a look.`;
  if (flagged > 0) return `${flagged} invader${flagged === 1 ? '' : 's'}, none high-risk.`;
  return 'All quiet in your sector.';
}

function GettingStarted() {
  const { isAdmin } = useSystem();
  const steps = [
    { icon: KeyRound, text: isAdmin ? 'Admin unlocked' : 'Unlock admin', to: '/admin', done: isAdmin },
    { icon: FlaskConical, text: 'Launch a practice wave', to: '/lab' },
    { icon: Cpu, text: 'Connect your ESP8266', to: '/devices' },
  ];
  return (
    <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
      {steps.map((step, i) => {
        const Icon = step.icon;
        return (
          <li key={step.text} className="bg-surface">
            <Link to={step.to} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2">
              <span className={`font-mono text-xs ${step.done ? 'text-emerald-300' : 'text-accent'}`}>{step.done ? '✓' : `0${i + 1}`}</span>
              <Icon className="size-4 text-ink-3" aria-hidden="true" />
              <span className="flex-1 text-ink">{step.text}</span>
              <ArrowRight className="size-4 text-ink-3" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function NextMissions() {
  const { missions } = useMissions();
  const next = missions.filter((m) => !m.done).slice(0, 3);
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <RankCard compact />
      <div>
        <p className="label">{next.length ? 'Next missions' : 'All missions complete'}</p>
        <ul className="mt-2 space-y-2">
          {next.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.id} className="flex items-center gap-2.5 text-sm">
                <Icon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-ink-2">{m.title}</span>
                <span className="font-mono text-xs text-accent">+{m.xp}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <Link to="/lab" className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-ink">
        Practice lab <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState('24h');
  const navigate = useNavigate();
  const now = useNow(15000);
  const mascot = useMascot();

  const stats = useApi(() => api.eventStats({ range }), [range], { refreshInterval: 30000 });
  const recent = useApi(() => api.events({ limit: 40 }), []);
  const alerts = useApi(() => api.events({ limit: 40, classification: 'suspicious,high-risk' }), []);

  useThrottledSocketRefresh([SOCKET_EVENTS.EVENT_NEW, SOCKET_EVENTS.SIMULATOR_RESET], () => {
    stats.refetch();
    recent.refetch();
    alerts.refetch();
  });

  const totals = stats.data?.totals;
  const byAction = Object.fromEntries((stats.data?.byAction ?? []).map((row) => [row.action, row.count]));
  const firstRun = recent.data && recent.data.pagination.total === 0;

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="label">{greeting()}</p>
            <SegmentedControl label="Time range" size="sm" options={RANGES} value={range} onChange={setRange} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {stats.error ? 'Mission control is offline.' : headlineFor(totals)}
            </h1>
            <p className="mt-1 text-sm text-ink-3">
              {stats.error
                ? stats.error.message
                : totals && (
                    <>
                      {RANGE_WORDS[range]} · {formatNumber(totals.total)} requests · {formatNumber(totals.device)} from your ESP8266,{' '}
                      {formatNumber(totals.simulated)} simulated
                    </>
                  )}
            </p>
          </div>
          {/* Outcome counts double as the legend for the scene's colours. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {SCORE.map((s) => (
              <div key={s.action}>
                <dt className="flex items-center gap-1.5 text-xs text-ink-3">
                  <span className={`size-2 rounded-full ${s.dot}`} aria-hidden="true" />
                  {s.label}
                </dt>
                <dd className="mt-0.5 text-xl font-semibold text-ink">{stats.data ? <CountUp value={byAction[s.action] ?? 0} /> : '—'}</dd>
              </div>
            ))}
          </dl>
          {totals?.suspicious > 0 && (
            <Link to="/events?classification=suspicious,high-risk" className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-ink">
              Review the invaders <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="flex flex-col justify-center border-t border-line bg-[#030303] lg:border-t-0 lg:border-l" aria-label="Live view">
          <SpaceScene
            events={recent.data?.data ?? []}
            live
            pipMood={mascot.mood === 'sleep' ? 'sleep' : 'calm'}
            onSelect={(event) => navigate(`/events/${event.id}`)}
            emptyNote={firstRun ? 'No visitors yet' : 'All quiet'}
          />
          <p className="px-4 pb-3 text-xs text-ink-3">Live view: each ship is a flagged request. Click one for details.</p>
        </div>
      </section>

      {firstRun && <GettingStarted />}

      <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-surface">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-semibold text-ink">Latest invaders</h2>
            <Link to="/events?classification=suspicious,high-risk" className="text-sm text-ink-3 hover:text-ink">
              See all
            </Link>
          </div>
          <div className="p-2">
            <AsyncContent
              state={alerts}
              isEmpty={(data) => data.data.length === 0}
              empty={
                <div className="flex flex-col items-center py-8 text-ink-3">
                  <SketchUfo className="w-24" />
                  <p className="font-doodle mt-2 text-lg">No invaders yet. The sky is clear!</p>
                </div>
              }
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
        </div>
        <div className="bg-surface">
          <NextMissions />
        </div>
      </section>
    </div>
  );
}
