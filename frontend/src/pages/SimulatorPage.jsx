import { ExternalLink, FlaskConical, Gauge, Info, Play, Trash2, TriangleAlert, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { describeError } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { AdminRequiredNotice } from '../components/AdminDialog.jsx';
import { ActionBadge, Badge, categoryLabel, SeverityBadge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardBody, CardHeader, PageHeader } from '../components/ui/Card.jsx';
import { Toggle } from '../components/ui/Controls.jsx';
import { ConfirmDialog } from '../components/ui/Modal.jsx';
import { AsyncContent, EmptyState } from '../components/ui/States.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatNumber } from '../lib/format.js';

const PROBE_REQUESTS = 10;

function ScenarioCard({ scenario, disabled, busy, onRun }) {
  return (
    <Card as="article" className="flex flex-col">
      <div className="flex-1 px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{scenario.label}</h3>
        <p className="mt-1 text-sm text-ink-2">{scenario.description}</p>
        {scenario.relatedRules.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scenario.relatedRules.map((rule) => (
              <Badge
                key={rule.ruleId}
                className={rule.enabled ? 'bg-surface-3 text-ink-2 ring-line-strong' : 'bg-amber-500/10 text-amber-200 ring-amber-400/30'}
                title={rule.enabled ? 'Rule enabled' : 'Rule disabled: this scenario will not be flagged by it'}
              >
                {rule.ruleId}
                {!rule.enabled && ' (disabled)'}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-line px-4 py-2.5">
        <Button size="sm" variant="primary" icon={Play} onClick={() => onRun(scenario.id)} disabled={disabled} loading={busy}>
          Run scenario
        </Button>
      </div>
    </Card>
  );
}

function RunResult({ result }) {
  return (
    <Card>
      <CardHeader
        title={`Last run: ${result.label}`}
        subtitle={`${result.generated} simulated event${result.generated === 1 ? '' : 's'} from ${result.sourceIp} (RFC 5737 test address)`}
        icon={FlaskConical}
        actions={
          <Link
            to={`/events?sourceType=simulator&search=${encodeURIComponent(result.sourceIp)}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
          >
            View in event feed <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="text-ink-2">
            Flagged: <strong className="text-ink">{result.flagged}</strong> of {result.generated}
          </span>
          {Object.entries(result.byAction).map(([action, count]) => (
            <span key={action} className="inline-flex items-center gap-1.5 text-ink-2">
              <ActionBadge action={action} /> × {count}
            </span>
          ))}
        </div>
        {result.disabledRules.length > 0 && (
          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Disabled rule(s) for this scenario: {result.disabledRules.join(', ')}. Enable them on the Detection rules page to see detections.
          </p>
        )}
        <div className="max-h-72 overflow-auto rounded border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2 text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Request</th>
                <th className="px-3 py-2 font-medium">Detection</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.events.map((event, index) => (
                <tr key={event.id}>
                  <td className="tabular px-3 py-1.5 text-ink-3">{index + 1}</td>
                  <td className="max-w-[280px] truncate px-3 py-1.5 font-mono text-ink-2">
                    <Link to={`/events/${event.id}`} className="hover:text-ink hover:underline">
                      {event.method} {event.path}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-ink-2">{categoryLabel(event.category)}</td>
                  <td className="px-3 py-1.5">
                    <SeverityBadge severity={event.severity} />
                  </td>
                  <td className="px-3 py-1.5">
                    <ActionBadge action={event.actionTaken} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
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
    <Card>
      <CardHeader title="API rate limiter demonstration" subtitle="HTTP 429 abuse protection on the backend itself" icon={Gauge} />
      <CardBody className="space-y-3 text-sm text-ink-2">
        <p>
          Sends {PROBE_REQUESTS} rapid requests from this browser to a test endpoint limited to a few requests per 10 seconds.
          Requests over the limit receive HTTP 429. One "API rate limit" event (marked simulated) is recorded per window,
          not one per rejected request.
        </p>
        <Button size="sm" icon={Zap} onClick={run} loading={busy} disabled={disabled}>
          Send {PROBE_REQUESTS} rapid requests
        </Button>
        {results.length > 0 && (
          <div>
            <ol className="flex flex-wrap gap-1.5" aria-label="Response status codes">
              {results.map((status, index) => (
                <li
                  key={index}
                  className={`rounded px-2 py-1 font-mono text-xs ring-1 ring-inset ${
                    status === 200 ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30' : 'bg-red-500/10 text-red-300 ring-red-400/30'
                  }`}
                >
                  #{index + 1} {status}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-ink-3">
              {accepted} accepted, {results.length - accepted} rejected with 429.
            </p>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </CardBody>
    </Card>
  );
}

export default function SimulatorPage() {
  const { isAdmin, simulatorEnabled, databaseConnected, health } = useSystem();
  const scenarios = useApi(() => api.scenarios(), [], { enabled: health ? simulatorEnabled : true });
  const [runningId, setRunningId] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [reuseSource, setReuseSource] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const canRun = isAdmin && simulatorEnabled && databaseConnected;

  async function runScenario(id) {
    setRunningId(id);
    setError('');
    try {
      const body = { scenario: id };
      if (reuseSource && lastResult?.sourceIp) body.sourceIp = lastResult.sourceIp;
      setLastResult(await api.runScenario(body));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRunningId(null);
    }
  }

  async function reset() {
    setResetBusy(true);
    setResetMessage('');
    try {
      const { deletedCount } = await api.resetSimulator();
      setResetMessage(`Deleted ${formatNumber(deletedCount)} simulated event${deletedCount === 1 ? '' : 's'}. Device events were not touched.`);
      setLastResult(null);
      setConfirmOpen(false);
    } catch (err) {
      setResetMessage(describeError(err));
      setConfirmOpen(false);
    } finally {
      setResetBusy(false);
    }
  }

  if (health && !simulatorEnabled) {
    return (
      <>
        <PageHeader title="Controlled testing" />
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="Simulator disabled on this server"
            description="Set SIMULATOR_ENABLED=true in backend/.env (development only) and restart the backend to use controlled test scenarios."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Controlled testing"
        description="Generate clearly labelled simulated events to demonstrate the detection rules without the ESP8266."
      />

      <div className="mb-4 space-y-3">
        <p className="flex items-start gap-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-sm text-violet-100">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Scenarios are generated inside the backend and pass through the same validation, detection and storage pipeline as
          device reports. Sources use reserved RFC 5737 documentation addresses (192.0.2.x, 198.51.100.x, 203.0.113.x). Nothing
          is sent to any other host and no network is scanned. Every resulting event is marked Simulated.
        </p>
        <AdminRequiredNotice action="run scenarios or reset simulator data" />
        {!databaseConnected && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
            MongoDB is not connected, so simulated events cannot be stored right now.
          </p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Scenarios</h2>
        <Toggle
          checked={reuseSource}
          onChange={setReuseSource}
          disabled={!lastResult}
          label={lastResult ? `Reuse last source (${lastResult.sourceIp})` : 'Reuse last source (run a scenario first)'}
        />
      </div>
      {error && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      <AsyncContent state={scenarios}>
        {(list) => (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {list.map((scenario) => (
              <ScenarioCard
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

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          {lastResult ? (
            <RunResult result={lastResult} />
          ) : (
            <Card>
              <EmptyState compact icon={Play} title="No scenario run yet" description="Results of the most recent run appear here." />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <RateLimitProbe disabled={!isAdmin} />
          <Card className="border-red-500/30">
            <CardHeader title="Reset demo data" subtitle="Deletes only events marked simulated" icon={Trash2} />
            <CardBody className="space-y-3 text-sm text-ink-2">
              <p>
                Removes every stored event with <code className="text-ink">simulated: true</code> and clears simulator detection
                counters and decisions. Events reported by real ESP8266 devices are never deleted by this action.
              </p>
              <Button variant="danger-outline" size="sm" icon={Trash2} disabled={!canRun} onClick={() => setConfirmOpen(true)}>
                Delete simulated events
              </Button>
              {resetMessage && <p className="text-xs text-ink-2">{resetMessage}</p>}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete all simulated events?"
        confirmLabel="Delete simulated events"
        danger
        busy={resetBusy}
        onConfirm={reset}
        onCancel={() => setConfirmOpen(false)}
      >
        This permanently deletes all events marked as simulated, including API rate-limiter demonstration events. Device-originated
        events are kept. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
