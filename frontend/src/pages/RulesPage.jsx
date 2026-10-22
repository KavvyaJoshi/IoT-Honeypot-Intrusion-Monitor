import { ChevronDown, ChevronUp, Gauge, Layers, RotateCcw, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeError } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { AdminRequiredNotice } from '../components/AdminDialog.jsx';
import { DataTable } from '../components/charts/ChartCard.jsx';
import { Badge, categoryLabel, SeverityBadge, SourceBadge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardHeader, PageHeader } from '../components/ui/Card.jsx';
import { SelectField, TextArea, TextField, Toggle } from '../components/ui/Controls.jsx';
import { AsyncContent, EmptyState } from '../components/ui/States.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useNow, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { SEVERITIES, SEVERITY_META } from '../lib/constants.js';
import { formatNumber, formatRelative, formatTime } from '../lib/format.js';

const ACTION_OPTIONS = [
  { value: 'log', label: 'Log only' },
  { value: 'rate-limit', label: 'Rate-limit source' },
  { value: 'block', label: 'Block source' },
];

const ACTION_WORDS = { log: 'Logs it', 'rate-limit': 'Slows the source', block: 'Blocks the source' };

/** Short, plain-language framing for each rule; the technical description is shown under "Tune". */
const PLAIN_RULES = {
  'request-rate': { title: 'Too many requests', catches: 'One source sending requests too fast, like a flood or an automated scanner.' },
  'failed-login': { title: 'Password guessing', catches: 'Someone failing to log in again and again on the test login page.' },
  'suspicious-path': { title: 'Snooping for secrets', catches: 'Requests for sensitive-looking pages such as /.env, /admin or /wp-login.php.' },
  'malformed-request': { title: 'Broken or tricky requests', catches: 'Odd methods, path tricks like ../, null bytes or oversized URLs.' },
  'not-found-repeat': { title: 'Page guessing', catches: 'Lots of requests for pages that do not exist (HTTP 404).' },
  'traffic-anomaly': { title: 'Traffic spike', catches: 'Total traffic to a device far above its normal level.' },
};

/** "Fires at 20 requests per source within 60 seconds"-style summary from the integer params. */
function thresholdSummary(rule) {
  const p = rule.params;
  switch (rule.id) {
    case 'request-rate':
      return `Fires at ${p.threshold} requests in ${p.windowSeconds}s`;
    case 'failed-login':
      return `Fires at ${p.threshold} failures in ${p.windowSeconds}s`;
    case 'not-found-repeat':
      return `Fires at ${p.threshold} missing pages in ${p.windowSeconds}s`;
    case 'traffic-anomaly':
      return `Fires above ${p.baselinePerMinute * p.multiplier} requests/min`;
    case 'suspicious-path':
      return `${p.patterns.length} watched patterns`;
    case 'malformed-request':
      return `Paths over ${p.maxPathLength} chars, ${p.allowedMethods.length} allowed methods`;
    default:
      return '';
  }
}

function toDraft(rule) {
  const params = {};
  for (const field of rule.paramFields) {
    const value = rule.params[field.key];
    params[field.key] = field.type === 'stringList' ? (value ?? []).join('\n') : String(value ?? '');
  }
  return { severity: rule.severity, action: rule.action, params };
}

function fromDraft(rule, draft) {
  const params = {};
  for (const field of rule.paramFields) {
    const raw = draft.params[field.key];
    params[field.key] =
      field.type === 'stringList'
        ? raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : Number(raw);
  }
  return { severity: draft.severity, action: draft.action, params };
}

function RuleCard({ rule, stats, isAdmin, onSaved }) {
  const [draft, setDraft] = useState(() => toDraft(rule));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const now = useNow(30000);

  useEffect(() => setDraft(toDraft(rule)), [rule]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(rule));

  async function save(patch) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await api.updateRule(rule.id, patch);
      onSaved(updated);
      setMessage('Saved. New events use this configuration immediately.');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const plain = PLAIN_RULES[rule.id] ?? { title: rule.name, catches: '' };
  return (
    <Card as="article" className={`p-5 ${rule.enabled ? '' : 'opacity-75'}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">{plain.title}</h3>
          <p className="mt-0.5 text-sm text-ink-2">{plain.catches}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <SeverityBadge severity={rule.severity} />
            <Badge className="bg-surface-3 text-ink-2 ring-line-strong">{ACTION_WORDS[rule.action]}</Badge>
            <span className="text-ink-3">{thresholdSummary(rule)}</span>
          </div>
          {stats && (
            <p className="mt-2 text-xs text-ink-3">
              {stats.matches ? `Fired ${formatNumber(stats.matches)} time${stats.matches === 1 ? '' : 's'} in 24h` : 'Not fired in 24h'}
              {stats.lastMatchedAt && ` · last ${formatRelative(stats.lastMatchedAt, now)}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            checked={rule.enabled}
            disabled={!isAdmin || busy}
            onChange={(enabled) => save({ enabled })}
            label={rule.enabled ? 'On' : 'Off'}
          />
          <Button size="sm" variant="ghost" icon={open ? ChevronUp : SlidersHorizontal} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Tune'}
          </Button>
        </div>
      </div>
      {message && !dirty && !open && <p className="mt-2 text-xs text-emerald-300">{message}</p>}
      {open && (
      <div className="mt-5 space-y-4 border-t border-line pt-5">
        <p className="text-sm text-ink-3">
          {rule.description.replace(/`/g, '')} <code className="text-xs">({rule.id} · {categoryLabel(rule.category)})</code>
        </p>

        <fieldset disabled={!isAdmin || busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="sr-only">Rule configuration</legend>
          <SelectField
            label="Severity"
            value={draft.severity}
            onChange={(severity) => setDraft({ ...draft, severity })}
            options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label }))}
          />
          <SelectField label="Action on match" value={draft.action} onChange={(action) => setDraft({ ...draft, action })} options={ACTION_OPTIONS} />
          {rule.paramFields.map((field) =>
            field.type === 'stringList' ? (
              <TextArea
                key={field.key}
                className="sm:col-span-2"
                label={field.label}
                rows={Math.min(8, Math.max(3, draft.params[field.key].split('\n').length))}
                value={draft.params[field.key]}
                onChange={(e) => setDraft({ ...draft, params: { ...draft.params, [field.key]: e.target.value } })}
                hint={`One per line, up to ${field.maxItems} entries of ${field.maxLength} characters. Plain text match, no regular expressions.`}
              />
            ) : (
              <TextField
                key={field.key}
                label={field.label}
                type="number"
                min={field.min}
                max={field.max}
                step={1}
                value={draft.params[field.key]}
                onChange={(e) => setDraft({ ...draft, params: { ...draft.params, [field.key]: e.target.value } })}
                hint={`Allowed ${field.min}–${field.max}`}
              />
            ),
          )}
        </fieldset>

        {error && <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
        {message && !dirty && <p className="text-xs text-emerald-300">{message}</p>}

        {isAdmin && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" icon={RotateCcw} disabled={busy} onClick={() => setDraft(toDraft({ ...rule, ...rule.defaults }))}>
              Load defaults
            </Button>
            <Button size="sm" variant="ghost" disabled={!dirty || busy} onClick={() => setDraft(toDraft(rule))}>
              Discard
            </Button>
            <Button size="sm" variant="primary" icon={Save} disabled={!dirty} loading={busy} onClick={() => save(fromDraft(rule, draft))}>
              Save changes
            </Button>
          </div>
        )}
      </div>
      )}
    </Card>
  );
}

function EnforcementTable({ state }) {
  const now = useNow(5000);
  return (
    <AsyncContent
      state={state}
      isEmpty={(data) => data.activeEnforcements.length === 0}
      empty={<EmptyState compact icon={ShieldCheck} title="No active rate-limit or block decisions" description="Decisions appear when a rule with a rate-limit or block action matches, and expire automatically." />}
    >
      {(data) => (
        <div className="p-4">
          <DataTable
            columns={[
              { key: 'sourceIdentifier', label: 'Source', render: (row) => <span className="font-mono">{row.sourceIdentifier}</span> },
              { key: 'sourceType', label: 'Origin', render: (row) => <SourceBadge sourceType={row.sourceType} /> },
              { key: 'action', label: 'Decision', render: (row) => (row.action === 'block' ? 'Block' : 'Rate-limit') },
              { key: 'ruleId', label: 'Triggered by', render: (row) => <code>{row.ruleId}</code> },
              { key: 'since', label: 'Since', render: (row) => formatTime(row.since) },
              {
                key: 'until',
                label: 'Expires',
                render: (row) => `${formatTime(row.until)} (${Math.max(0, Math.ceil((new Date(row.until) - now) / 1000))}s)`,
              },
            ]}
            rows={data.activeEnforcements.map((row) => ({ ...row, key: `${row.sourceType}-${row.sourceIdentifier}` }))}
          />
        </div>
      )}
    </AsyncContent>
  );
}

export default function RulesPage() {
  const { isAdmin } = useSystem();
  const rules = useApi(() => api.rules(), []);
  const stats = useApi(() => api.detectionStats({ range: '24h' }), [], { refreshInterval: 15000 });

  useThrottledSocketRefresh(SOCKET_EVENTS.RULES_UPDATED, rules.refetch);
  useThrottledSocketRefresh([SOCKET_EVENTS.EVENT_NEW, SOCKET_EVENTS.SIMULATOR_RESET], stats.refetch, 2000);

  const statsById = new Map((stats.data?.rules ?? []).map((row) => [row.ruleId, row]));

  return (
    <>
      <PageHeader
        title="Rules"
        description="Each rule watches for one kind of suspicious behaviour. Switch rules on or off, or tune how sensitive they are."
      />

      <div className="mb-4 space-y-3">
        <AdminRequiredNotice action="change rules" />
      </div>

      <AsyncContent state={rules}>
        {(list) => (
          <div className="stagger grid grid-cols-1 gap-4 xl:grid-cols-2">
            {list.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                stats={statsById.get(rule.id)}
                isAdmin={isAdmin}
                onSaved={(updated) => rules.setData((current) => current.map((r) => (r.id === updated.id ? updated : r)))}
              />
            ))}
          </div>
        )}
      </AsyncContent>

      <details className="group mt-6 rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-2 font-medium text-ink">
            <Layers className="size-4 text-ink-3" aria-hidden="true" /> How detecting differs from blocking
          </span>
          <ChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid grid-cols-1 gap-4 border-t border-line px-5 py-5 text-sm text-ink-2 md:grid-cols-3">
          <div>
            <p className="font-medium text-ink">API abuse protection</p>
            <p className="mt-1">
              HTTP rate limiters in front of the backend's own endpoints. Excess requests get HTTP 429 and one
              "API rate limit" event per client per window.
            </p>
          </div>
          <div>
            <p className="font-medium text-ink">Detection of suspicious activity</p>
            <p className="mt-1">
              These rules analyse requests the honeypot device observed and classify them. A match is a signal worth
              reviewing, not proof of an attack or of who is behind it.
            </p>
          </div>
          <div>
            <p className="font-medium text-ink">Application-layer blocking</p>
            <p className="mt-1">
              Rules with a rate-limit or block action create a time-limited decision. The ingest API tells the ESP8266 to
              throttle or refuse that client. This is not a network firewall.
            </p>
          </div>
        </div>
      </details>

      <Card className="mt-4" id="enforcement">
        <CardHeader
          title="Slowed or blocked right now"
          subtitle="Temporary decisions made by the rules. They expire on their own (and reset if the backend restarts)."
          icon={Gauge}
        />
        <EnforcementTable state={stats} />
      </Card>

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-3">
        <SlidersHorizontal className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Short-term counters (sliding windows) live in the backend process memory. Persisted events are unaffected by restarts,
        but counters and active decisions reset. See docs/ARCHITECTURE.md for the distributed-deployment notes.
      </p>
    </>
  );
}
