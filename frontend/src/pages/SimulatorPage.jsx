import {
  Bug,
  ChevronDown,
  ExternalLink,
  FileWarning,
  FlaskConical,
  Gauge,
  Globe,
  Info,
  KeyRound,
  Play,
  RotateCcw,
  Search,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { describeError } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { AdminRequiredNotice } from '../components/AdminDialog.jsx';
import { ActionBadge, SeverityBadge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, PageHeader } from '../components/ui/Card.jsx';
import { Toggle } from '../components/ui/Controls.jsx';
import { ConfirmDialog } from '../components/ui/Modal.jsx';
import { AsyncContent, EmptyState } from '../components/ui/States.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { MissionList, RankCard } from '../game/GameWidgets.jsx';
import { useMissions } from '../game/MissionsContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { describeEvent } from '../lib/describe.js';
import { formatNumber } from '../lib/format.js';

const PROBE_REQUESTS = 10;

/** Friendly framing for each backend scenario. */
const CHALLENGES = {
  normal: { icon: Globe, story: 'A regular visitor opens a page.', expect: 'Nothing should be flagged.' },
  'repeated-requests': { icon: FileWarning, story: 'Someone guesses page names that do not exist.', expect: 'The page-guessing rule fires.' },
  'failed-login': { icon: KeyRound, story: 'A bot keeps guessing the admin password.', expect: 'The source gets blocked.' },
  'suspicious-path': { icon: Search, story: 'A scanner looks for secret files like /.env.', expect: 'Logged as a suspicious probe.' },
  malformed: { icon: Bug, story: 'A broken or tricky request arrives.', expect: 'The malformed-request rule fires.' },
  'rate-limit-threshold': { icon: Gauge, story: 'One source floods the device with requests.', expect: 'It gets rate-limited.' },
};

function resultMessage(result) {
  if (result.disabledRules.length) {
    return { tone: 'warning', title: 'No detection: rule is off', message: `Turn on ${result.disabledRules.join(', ')} on the Rules page.` };
  }
  if (result.scenario === 'normal') {
    return { tone: 'success', title: 'Normal traffic passed', message: 'No rules fired, exactly as expected.' };
  }
  const blocked = result.byAction.blocked ?? 0;
  const limited = result.byAction['rate-limited'] ?? 0;
  const outcome = blocked ? `${blocked} blocked` : limited ? `${limited} rate-limited` : 'logged for review';
  return {
    tone: 'success',
    title: `Caught it! ${result.flagged} of ${result.generated} flagged`,
    message: `Outcome: ${outcome}. Simulated source ${result.sourceIp}.`,
  };
}

function ChallengeCard({ scenario, disabled, busy, onRun }) {
  const challenge = CHALLENGES[scenario.id] ?? { icon: FlaskConical, story: scenario.description, expect: '' };
  const Icon = challenge.icon;
  const ruleOff = scenario.relatedRules.some((r) => !r.enabled);
  return (
    <Card as="article" className="lift flex flex-col p-5 hover:border-line-strong">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface-3 text-accent">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{scenario.label}</h3>
          <p className="mt-1 text-sm text-ink-2">{challenge.story}</p>
        </div>
      </div>
      <p className="mt-3 flex-1 text-xs text-ink-3">
        Expected: {challenge.expect}
        {ruleOff && <span className="mt-1 block text-amber-300">A related rule is turned off.</span>}
      </p>
      <Button className="mt-4 self-start" size="sm" variant="primary" icon={Play} onClick={() => onRun(scenario.id)} disabled={disabled} loading={busy}>
        Run
      </Button>
    </Card>
  );
}

function LastRun({ result }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">Last run: {result.label}</h2>
          <p className="text-sm text-ink-3">
            {result.generated} simulated request{result.generated === 1 ? '' : 's'} from {result.sourceIp} · {result.flagged} flagged
          </p>
        </div>
        <Link
          to={`/events?sourceType=simulator&search=${encodeURIComponent(result.sourceIp)}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:text-accent"
        >
          See in Events <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <ol className="mt-4 max-h-72 space-y-1 overflow-auto">
        {result.events.map((event, index) => (
          <li key={event.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
            <span className="tabular w-6 text-right text-xs text-ink-3">{index + 1}</span>
            <Link to={`/events/${event.id}`} className="min-w-0 flex-1 truncate text-ink-2 hover:text-ink">
              {describeEvent(event)}
            </Link>
            <SeverityBadge severity={event.severity} />
            <ActionBadge action={event.actionTaken} />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RateLimitProbe({ disabled }) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    setResults([]);
    try {
      for (let i = 0; i < PROBE_REQUESTS; i += 1) {
        const response = await api.rateLimitProbe();
        if (response.status === 401 || response.status === 503) {
          setError(response.data?.error?.message ?? `HTTP ${response.status}`);
          break;
        }
        setResults((current) => [...current, response.status]);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const accepted = results.filter((s) => s === 200).length;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-ink">API rate limiter</h3>
        <p className="mt-1 text-sm text-ink-2">
          Fires {PROBE_REQUESTS} quick requests at the backend. After a few, it answers HTTP 429 ("too many requests"). This protects the
          API itself and is separate from the detection rules.
        </p>
      </div>
      <Button size="sm" icon={Zap} onClick={run} loading={busy} disabled={disabled}>
        Send {PROBE_REQUESTS} rapid requests
      </Button>
      {results.length > 0 && (
        <div>
          <ol className="flex flex-wrap gap-1.5" aria-label="Response status codes">
            {results.map((status, index) => (
              <li
                key={index}
                className={`rounded-md px-2 py-1 font-mono text-xs ring-1 ring-inset ${
                  status === 200 ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30' : 'bg-red-500/10 text-red-300 ring-red-400/30'
                }`}
              >
                {status}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-3">
            {accepted} accepted, {results.length - accepted} rejected with 429.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export default function SimulatorPage() {
  const { isAdmin, simulatorEnabled, databaseConnected, health } = useSystem();
  const { notify } = useToast();
  const { resetProgress } = useMissions();
  const scenarios = useApi(() => api.scenarios(), [], { enabled: health ? simulatorEnabled : true });
  const [runningId, setRunningId] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [reuseSource, setReuseSource] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const canRun = isAdmin && simulatorEnabled && databaseConnected;

  async function runScenario(id) {
    setRunningId(id);
    try {
      const body = { scenario: id };
      if (reuseSource && lastResult?.sourceIp) body.sourceIp = lastResult.sourceIp;
      const result = await api.runScenario(body);
      setLastResult(result);
      notify(resultMessage(result));
    } catch (err) {
      notify({ tone: 'warning', title: 'Could not run the scenario', message: describeError(err) });
    } finally {
      setRunningId(null);
    }
  }

  async function confirmAction() {
    setBusy(true);
    try {
      if (confirm === 'data') {
        const { deletedCount } = await api.resetSimulator();
        setLastResult(null);
        notify({ tone: 'success', title: 'Practice data cleared', message: `Deleted ${formatNumber(deletedCount)} simulated events. Device events were kept. Earned missions stay earned.` });
      } else {
        resetProgress();
        notify({ tone: 'info', title: 'Mission progress reset', message: 'Missions are re-checked against current data.' });
      }
    } catch (err) {
      notify({ tone: 'warning', title: 'Reset failed', message: describeError(err) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (health && !simulatorEnabled) {
    return (
      <>
        <PageHeader title="Practice lab" />
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="Simulator disabled on this server"
            description="Set SIMULATOR_ENABLED=true in backend/.env (development only) and restart the backend."
          />
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Practice lab"
        description="Run safe, simulated attacks against your own backend, watch the rules react, and complete missions to rank up."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="p-6">
          <RankCard />
        </Card>
        <div className="space-y-3">
          <AdminRequiredNotice action="run practice scenarios" />
          <p className="flex items-start gap-2 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.07] px-4 py-3 text-sm text-fuchsia-100">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Everything here is simulated inside the backend with reserved test IPs (192.0.2.x, 198.51.100.x, 203.0.113.x). Nothing is
            sent to other hosts, and every event is labelled Simulated.
          </p>
          {!databaseConnected && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              The database is offline, so practice events cannot be stored right now.
            </p>
          )}
        </div>
      </div>

      <section aria-labelledby="challenges">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="challenges" className="text-lg font-semibold text-ink">
              Challenges
            </h2>
            <p className="text-sm text-ink-3">Each one plays a small scenario. Results pop up in the corner.</p>
          </div>
        </div>
        <AsyncContent state={scenarios}>
          {(list) => (
            <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((scenario) => (
                <ChallengeCard
                  key={scenario.id}
                  scenario={scenario}
                  disabled={!canRun || (runningId !== null && runningId !== scenario.id)}
                  busy={runningId === scenario.id}
                  onRun={runScenario}
                />
              ))}
            </div>
          )}
        </AsyncContent>
      </section>

      {lastResult && <LastRun result={lastResult} />}

      <section aria-labelledby="missions">
        <h2 id="missions" className="text-lg font-semibold text-ink">
          Missions
        </h2>
        <p className="mb-3 text-sm text-ink-3">Earn XP for things that really happened in your backend. Your progress is saved in this browser.</p>
        <MissionList />
      </section>

      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-2 font-medium text-ink">
            <Wrench className="size-4 text-ink-3" aria-hidden="true" /> Lab tools
          </span>
          <ChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-8 border-t border-line px-5 py-5 lg:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-ink">Repeat from the same source</h3>
              <p className="mb-2 mt-1 text-sm text-ink-2">Re-use the last simulated IP to see a block or rate-limit carry over to new requests.</p>
              <Toggle
                checked={reuseSource}
                onChange={setReuseSource}
                disabled={!lastResult}
                label={lastResult ? `Reuse ${lastResult.sourceIp}` : 'Run a challenge first'}
              />
            </div>
            <RateLimitProbe disabled={!isAdmin} />
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-ink">Clear practice data</h3>
              <p className="mb-2 mt-1 text-sm text-ink-2">Deletes only events marked simulated. Real ESP8266 events are never touched.</p>
              <Button variant="danger-outline" size="sm" icon={Trash2} disabled={!canRun} onClick={() => setConfirm('data')}>
                Delete simulated events
              </Button>
            </div>
            <div>
              <h3 className="font-medium text-ink">Reset mission progress</h3>
              <p className="mb-2 mt-1 text-sm text-ink-2">Clears XP and badges in this browser. Missions are then re-checked against current data.</p>
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setConfirm('progress')}>
                Reset progress
              </Button>
            </div>
          </div>
        </div>
      </details>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'data' ? 'Delete all simulated events?' : 'Reset mission progress?'}
        confirmLabel={confirm === 'data' ? 'Delete simulated events' : 'Reset progress'}
        danger={confirm === 'data'}
        busy={busy}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
      >
        {confirm === 'data'
          ? 'This permanently deletes every event marked as simulated, including rate-limiter demo events. Device events are kept.'
          : 'Your XP and badges in this browser will be cleared. Nothing in the backend changes.'}
      </ConfirmDialog>
    </div>
  );
}
