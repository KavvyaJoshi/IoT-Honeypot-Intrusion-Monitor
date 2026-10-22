import { Gauge, Layers, RotateCcw, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeError } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { AdminRequiredNotice } from '../components/AdminDialog.jsx';
import { DataTable } from '../components/charts/ChartCard.jsx';
import { Badge, categoryLabel, SeverityBadge, SourceBadge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardBody, CardHeader, PageHeader } from '../components/ui/Card.jsx';
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

  return (
    <Card as="article" className={rule.enabled ? '' : 'opacity-80'}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{rule.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <code>{rule.id}</code>
            <span>·</span>
            <span>{categoryLabel(rule.category)}</span>
          </p>
        </div>
        <Toggle
          checked={rule.enabled}
          disabled={!isAdmin || busy}
          onChange={(enabled) => save({ enabled })}
          label={rule.enabled ? 'Enabled' : 'Disabled'}
        />
      </div>
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-2">{rule.description.replace(/`/g, '')}</p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SeverityBadge severity={rule.severity} />
          <Badge className="bg-surface-3 text-ink-2 ring-line-strong">action: {rule.action}</Badge>
          {stats && (
            <span className="text-ink-3">
              {formatNumber(stats.matches)} matches in 24h
              {stats.lastMatchedAt && ` · last ${formatRelative(stats.lastMatchedAt, now)}`}
            </span>
          )}
        </div>

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
      </CardBody>
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
        title="Detection rules"
        description="Explainable, threshold-based rules evaluated by the backend for every event. Every flagged event records which rule matched and why."
      />

      <div className="mb-4 space-y-3">
        <AdminRequiredNotice action="enable, disable or tune rules" />
      </div>

      <Card className="mb-4">
        <CardHeader title="Three different protections" icon={Layers} />
        <CardBody className="grid grid-cols-1 gap-4 text-sm text-ink-2 md:grid-cols-3">
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
        </CardBody>
      </Card>

      <AsyncContent state={rules}>
        {(list) => (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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

      <Card className="mt-4" id="enforcement">
        <CardHeader
          title="Active enforcement decisions"
          subtitle="Sources currently rate-limited or blocked (in-memory, cleared on backend restart)"
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
