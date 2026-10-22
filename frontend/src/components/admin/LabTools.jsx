import { RotateCcw, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '../../api/client.js';
import { api } from '../../api/endpoints.js';
import { useSystem } from '../../context/SystemContext.jsx';
import { useMissions } from '../../game/MissionsContext.jsx';
import { formatNumber } from '../../lib/format.js';
import { Button } from '../ui/Button.jsx';
import { ConfirmDialog } from '../ui/Modal.jsx';
import { useToast } from '../ui/Toast.jsx';

const PROBE_REQUESTS = 10;

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
      <p className="text-sm text-ink-2">
        Fires {PROBE_REQUESTS} quick requests at the backend. After a few it answers HTTP 429. This protects the API itself and is
        separate from the detection rules.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" icon={Zap} onClick={run} loading={busy} disabled={disabled}>
          Send {PROBE_REQUESTS} rapid requests
        </Button>
        {results.length > 0 && (
          <ol className="flex flex-wrap gap-1" aria-label="Response status codes">
            {results.map((status, index) => (
              <li
                key={index}
                className={`rounded px-1.5 py-0.5 font-mono text-xs ${status === 200 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}
              >
                {status}
              </li>
            ))}
          </ol>
        )}
      </div>
      {results.length > 0 && (
        <p className="text-xs text-ink-3">
          {accepted} accepted, {results.length - accepted} rejected with 429.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/** Practice-data and progress maintenance, grouped in the Admin panel. */
export function LabTools() {
  const { isAdmin, databaseConnected, simulatorEnabled } = useSystem();
  const { resetProgress } = useMissions();
  const { notify } = useToast();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function confirmAction() {
    setBusy(true);
    try {
      if (confirm === 'data') {
        const { deletedCount } = await api.resetSimulator();
        notify({ tone: 'success', title: 'Practice data cleared', message: `Deleted ${formatNumber(deletedCount)} simulated events. Device events were kept.` });
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

  const rows = [
    { title: 'API rate limiter test', body: <RateLimitProbe disabled={!isAdmin || !simulatorEnabled} /> },
    {
      title: 'Clear practice data',
      body: (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">Deletes only events marked simulated. Real ESP8266 events are never touched.</p>
          <Button variant="danger-outline" size="sm" icon={Trash2} disabled={!isAdmin || !databaseConnected || !simulatorEnabled} onClick={() => setConfirm('data')}>
            Delete simulated events
          </Button>
        </div>
      ),
    },
    {
      title: 'Mission progress',
      body: (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">Clears XP and badges in this browser. Nothing in the backend changes.</p>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setConfirm('progress')}>
            Reset progress
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="divide-y divide-line">
        {rows.map((row) => (
          <section key={row.title} className="py-4 first:pt-0 last:pb-0">
            <h3 className="label mb-2">{row.title}</h3>
            {row.body}
          </section>
        ))}
      </div>
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
    </>
  );
}
