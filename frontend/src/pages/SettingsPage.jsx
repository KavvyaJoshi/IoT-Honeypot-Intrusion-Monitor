import { Activity, Cpu, Database, FileCog, HeartPulse, Radio, Save, Server, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { describeError } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { AdminRequiredNotice } from '../components/AdminDialog.jsx';
import { StatusIndicator } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardBody, CardHeader, KeyValueList, PageHeader } from '../components/ui/Card.jsx';
import { TextArea, TextField } from '../components/ui/Controls.jsx';
import { AsyncContent } from '../components/ui/States.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useNow, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { formatDateTime, formatDuration, formatRelative } from '../lib/format.js';

const NUMBER_FIELDS = [
  { key: 'heartbeatTimeoutSeconds', label: 'Heartbeat timeout (s)', min: 15, max: 3600, hint: 'Device shows Offline after this long without a heartbeat.' },
  { key: 'recommendedHeartbeatIntervalSeconds', label: 'Recommended heartbeat interval (s)', min: 5, max: 1800, hint: 'Returned to the device; must be below the timeout.' },
  { key: 'enforcementDurationSeconds', label: 'Rate-limit / block duration (s)', min: 10, max: 86400, hint: 'How long a rule-triggered decision lasts.' },
  { key: 'retentionDays', label: 'Event retention (days)', min: 0, max: 365, hint: '0 keeps events forever. Older events are deleted hourly.' },
];

const ENV_GUIDE = [
  ['MONGODB_URI', 'Local MongoDB connection string. Keep credentials in backend/.env only.'],
  ['DEVICE_API_KEY', 'Shared secret the ESP8266 sends as X-Device-Key. Never enter it in the dashboard.'],
  ['ADMIN_TOKEN', 'Unlocks admin actions in this dashboard. Use a long random value.'],
  ['CORS_ORIGINS', 'Browser origins allowed to call the API and open the live stream.'],
  ['SIMULATOR_ENABLED', 'Development aid. Set false before any deployment.'],
  ['HOST / PORT', 'HOST=0.0.0.0 lets the ESP8266 reach the API over Wi-Fi (scope the firewall rule); 127.0.0.1 keeps it laptop-only.'],
  ['CORS_ALLOW_LAN_ORIGINS', "Development: also allow this laptop's own current LAN IPs on LAN_FRONTEND_PORTS, so IP changes need no edits."],
  ['VITE_API_BASE_URL', 'Frontend: empty = use the Vite proxy (recommended); set only to call the API on another origin.'],
  ['RATE_LIMIT_*', 'HTTP API limits per client IP (public, device, simulator, demo probe).'],
  ['TRUST_PROXY', 'Only true behind a reverse proxy, otherwise clients could spoof X-Forwarded-For.'],
];

function HealthRow({ icon: Icon, label, status, detail }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <span className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 text-ink-3" aria-hidden="true" />
        <span>
          <span className="block text-sm text-ink">{label}</span>
          {detail && <span className="block text-xs text-ink-3">{detail}</span>}
        </span>
      </span>
      {status}
    </li>
  );
}

function SystemHealth() {
  const system = useSystem();
  const now = useNow(5000);
  const db = useApi(() => api.databaseHealth(), [system.databaseConnected], { refreshInterval: 15000 });
  const devices = useApi(() => api.devices(), [], { refreshInterval: 30000 });
  useThrottledSocketRefresh(SOCKET_EVENTS.DEVICE_UPDATE, devices.refetch);

  const deviceList = devices.data?.data ?? [];
  const lastSeen = deviceList.map((d) => d.lastSeenAt).filter(Boolean).sort().at(-1);
  const online = deviceList.filter((d) => d.status === 'online').length;

  return (
    <Card>
      <CardHeader title="System health" icon={HeartPulse} />
      <ul className="divide-y divide-line px-4">
        <HealthRow
          icon={Server}
          label="Backend API"
          detail={
            system.health
              ? `v${system.health.version} · ${system.health.environment} · up ${formatDuration(system.health.uptimeSeconds * 1000)}${
                  system.apiLatencyMs !== null ? ` · ${system.apiLatencyMs} ms` : ''
                }`
              : 'Waiting for /api/health'
          }
          status={<StatusIndicator status={system.apiReachable === null ? 'unknown' : system.apiReachable ? 'ok' : 'down'} />}
        />
        <HealthRow
          icon={Database}
          label="MongoDB"
          detail={
            db.data?.connected
              ? `${db.data.name} on ${db.data.host}:${db.data.port}${db.data.latencyMs !== null ? ` · ping ${db.data.latencyMs} ms` : ''}`
              : db.data?.lastError ?? `State: ${system.database?.state ?? 'unknown'}`
          }
          status={<StatusIndicator status={system.apiReachable === false ? 'unknown' : system.databaseConnected ? 'ok' : 'down'} label={system.databaseConnected ? 'Connected' : undefined} />}
        />
        <HealthRow
          icon={Radio}
          label="Socket.IO live stream"
          detail={
            system.socket.connected
              ? `Transport: ${system.socket.transport ?? 'unknown'} · ${system.health?.realtime?.connectedClients ?? '?'} dashboard client(s)`
              : 'Reconnecting automatically'
          }
          status={<StatusIndicator status={system.socket.connected ? 'ok' : 'degraded'} label={system.socket.connected ? 'Connected' : 'Disconnected'} />}
        />
        <HealthRow
          icon={Cpu}
          label="ESP8266 devices"
          detail={
            deviceList.length
              ? `${online} of ${deviceList.length} online · last seen ${formatRelative(lastSeen, now)}${lastSeen ? ` (${formatDateTime(lastSeen)})` : ''}`
              : 'No device registered'
          }
          status={<StatusIndicator status={online ? 'online' : deviceList.length ? 'offline' : 'never-connected'} label={online ? 'Online' : deviceList.length ? 'Offline' : 'None'} />}
        />
      </ul>
    </Card>
  );
}

function RuntimeSettingsForm({ settings, onSaved }) {
  const { isAdmin } = useSystem();
  const toDraft = (s) => ({ ...Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, String(s[f.key])])), testLoginPaths: s.testLoginPaths.join('\n') });
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  useEffect(() => setDraft(toDraft(settings)), [settings]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback({ type: '', text: '' });
    try {
      const patch = Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, Number(draft[f.key])]));
      patch.testLoginPaths = draft.testLoginPaths.split('\n').map((p) => p.trim()).filter(Boolean);
      const updated = await api.updateSettings(patch);
      onSaved(updated);
      setFeedback({ type: 'ok', text: 'Settings saved.' });
    } catch (err) {
      setFeedback({ type: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={!isAdmin || busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Runtime settings</legend>
        {NUMBER_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            type="number"
            min={field.min}
            max={field.max}
            step={1}
            required
            value={draft[field.key]}
            onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
            hint={field.hint}
          />
        ))}
        <TextArea
          className="sm:col-span-2"
          label="Designated test login endpoint(s)"
          rows={2}
          value={draft.testLoginPaths}
          onChange={(e) => setDraft({ ...draft, testLoginPaths: e.target.value })}
          hint="One path per line, starting with /. Used by the failed-login rule."
        />
      </fieldset>
      {feedback.text && (
        <p role={feedback.type === 'error' ? 'alert' : 'status'} className={`text-xs ${feedback.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
          {feedback.text}
        </p>
      )}
      {isAdmin && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" icon={Save} loading={busy}>
            Save settings
          </Button>
        </div>
      )}
    </form>
  );
}

export default function SettingsPage() {
  const settings = useApi(() => api.settings(), []);
  const rules = useApi(() => api.rules(), []);
  useThrottledSocketRefresh(SOCKET_EVENTS.SETTINGS_UPDATED, settings.refetch);
  useThrottledSocketRefresh(SOCKET_EVENTS.RULES_UPDATED, rules.refetch);

  return (
    <>
      <PageHeader title="Settings & system health" description="Connection status, runtime settings and environment configuration. Secrets are never displayed." />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SystemHealth />

        <Card>
          <CardHeader title="Runtime settings" subtitle="Stored in MongoDB, applied immediately" icon={SlidersHorizontal} />
          <CardBody className="space-y-4">
            <AdminRequiredNotice action="change settings" />
            <AsyncContent state={settings} compact>
              {(data) => <RuntimeSettingsForm settings={data.runtime} onSaved={(updated) => settings.setData(() => updated)} />}
            </AsyncContent>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Detection thresholds"
            subtitle="Current values; edit them on the Detection rules page"
            icon={Activity}
            actions={
              <Link to="/rules" className="text-xs font-medium text-accent-ink hover:text-accent">
                Edit rules
              </Link>
            }
          />
          <AsyncContent state={rules} compact>
            {(list) => (
              <ul className="divide-y divide-line px-4">
                {list.map((rule) => (
                  <li key={rule.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                    <span className={rule.enabled ? 'text-ink' : 'text-ink-3 line-through'}>{rule.name}</span>
                    <span className="font-mono text-xs text-ink-2">
                      {rule.paramFields
                        .filter((f) => f.type === 'integer')
                        .map((f) => `${f.key}=${rule.params[f.key]}`)
                        .join(' · ')}
                      {!rule.enabled && ' (disabled)'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AsyncContent>
        </Card>

        <Card>
          <CardHeader title="Environment configuration" subtitle="Read-only, from backend/.env (restart to change)" icon={FileCog} />
          <AsyncContent state={settings} compact>
            {(data) => {
              const env = data.environment;
              const yesNo = (value, good = true) => (
                <span className={value === good ? 'text-emerald-300' : 'text-amber-300'}>{value ? 'Yes' : 'No'}</span>
              );
              return (
                <CardBody className="space-y-5">
                  <KeyValueList
                    items={[
                      { label: 'Environment', value: env.nodeEnv },
                      {
                        label: 'API binding',
                        value: (
                          <span>
                            <span className="font-mono text-xs">
                              {env.host}:{env.port}
                            </span>{' '}
                            <span className="text-xs text-ink-3">
                              {['127.0.0.1', 'localhost', '::1'].includes(env.host)
                                ? '(laptop only; ESP8266 cannot connect)'
                                : '(LAN devices can connect if the firewall allows it)'}
                            </span>
                          </span>
                        ),
                      },
                      { label: 'Admin token set', value: yesNo(env.adminTokenConfigured) },
                      { label: 'Device key set', value: yesNo(env.deviceApiKeyConfigured) },
                      { label: 'Simulator enabled', value: yesNo(env.simulatorEnabled, env.nodeEnv !== 'production') },
                      { label: 'Trust proxy', value: env.trustProxy ? 'Yes' : 'No' },
                      {
                        label: 'CORS origins',
                        value: (
                          <span className="text-xs">
                            <span className="font-mono">{env.corsOrigins.join(', ') || '(none)'}</span>
                            {env.corsAllowLanOrigins && (
                              <span className="text-ink-3"> + this laptop's own LAN IPs on ports {env.lanFrontendPorts.join(', ')}</span>
                            )}
                          </span>
                        ),
                      },
                      { label: 'Max body size', value: `${env.maxRequestBodyBytes / 1024} KB` },
                      {
                        label: 'API rate limits',
                        value: (
                          <span className="text-xs">
                            public {env.rateLimits.publicMax}, device {env.rateLimits.deviceMax}, simulator {env.rateLimits.simulatorMax} per{' '}
                            {env.rateLimits.windowMs / 1000}s · probe {env.rateLimits.probeMax} per {env.rateLimits.probeWindowMs / 1000}s
                          </span>
                        ),
                      },
                    ]}
                  />
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Configuration guidance</p>
                    <ul className="space-y-1.5 text-xs text-ink-2">
                      {ENV_GUIDE.map(([name, text]) => (
                        <li key={name}>
                          <code className="text-ink">{name}</code>: {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardBody>
              );
            }}
          </AsyncContent>
        </Card>
      </div>
    </>
  );
}
