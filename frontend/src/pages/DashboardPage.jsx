import { Activity, Cpu, Gauge, ListFilter, Server, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { BarList } from '../components/charts/BarList.jsx';
import { ChartCard, DataTable } from '../components/charts/ChartCard.jsx';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart.jsx';
import { EventTable } from '../components/events/EventTable.jsx';
import { categoryLabel } from '../components/ui/Badge.jsx';
import { Card, CardHeader, PageHeader } from '../components/ui/Card.jsx';
import { SegmentedControl, SelectField } from '../components/ui/Controls.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';
import { AsyncContent, EmptyState } from '../components/ui/States.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useNow, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { CHART_COLORS, RANGE_OPTIONS, SEVERITY_META, SOURCE_FILTER_OPTIONS } from '../lib/constants.js';
import { formatBucketRange, formatNumber, formatRelative } from '../lib/format.js';

const TIMELINE_SERIES = [
  { key: 'total', label: 'All requests', color: CHART_COLORS.total, type: 'area' },
  { key: 'suspicious', label: 'Flagged (suspicious or high risk)', color: CHART_COLORS.flagged, type: 'line' },
];

function percent(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : '0%';
}

export default function DashboardPage() {
  const [range, setRange] = useState('1h');
  const [source, setSource] = useState('');
  const sourceType = source || undefined;
  const now = useNow(10000);
  const system = useSystem();

  const stats = useApi(() => api.eventStats({ range, sourceType }), [range, sourceType], { refreshInterval: 30000 });
  const recent = useApi(() => api.events({ limit: 8, sourceType }), [sourceType]);
  const devices = useApi(() => api.devices(), [], { refreshInterval: 30000 });

  useThrottledSocketRefresh([SOCKET_EVENTS.EVENT_NEW, SOCKET_EVENTS.SIMULATOR_RESET], () => {
    stats.refetch();
    recent.refetch();
  });
  useThrottledSocketRefresh(SOCKET_EVENTS.DEVICE_UPDATE, devices.refetch);

  const totals = stats.data?.totals;
  const deviceList = devices.data?.data ?? [];
  const online = deviceList.filter((d) => d.status === 'online').length;
  const lastHeartbeat = deviceList.map((d) => d.lastHeartbeatAt).filter(Boolean).sort().at(-1);
  const backendStatus = system.apiReachable === false ? 'Unavailable' : system.databaseConnected ? 'Operational' : 'Degraded';
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label.toLowerCase();

  return (
    <>
      <PageHeader
        title="Security overview"
        description="Requests observed by the honeypot endpoint and the verdicts of the detection engine. All figures come from the backend."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <SegmentedControl label="Time range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
        <SelectField label="Source" hideLabel value={source} onChange={setSource} options={SOURCE_FILTER_OPTIONS} className="w-44" />
        {stats.refreshing && <span className="text-xs text-ink-3">Updating…</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Requests received"
          icon={Activity}
          tone="info"
          loading={stats.loading}
          value={formatNumber(totals?.total)}
          hint={totals && `${formatNumber(totals.device)} ESP8266 · ${formatNumber(totals.simulated)} simulated · ${rangeLabel}`}
          to="/events"
        />
        <StatCard
          label="Suspicious"
          icon={TriangleAlert}
          tone="warn"
          loading={stats.loading}
          value={formatNumber(totals?.suspicious)}
          hint={totals && `${percent(totals.suspicious, totals.total)} of requests flagged`}
          to="/events?classification=suspicious,high-risk"
        />
        <StatCard
          label="High / critical"
          icon={ShieldAlert}
          tone="danger"
          loading={stats.loading}
          value={formatNumber(totals?.highSeverity)}
          hint={totals && `${formatNumber(totals.critical)} critical`}
          to="/events?severity=high,critical"
        />
        <StatCard
          label="Rate-limited sources"
          icon={Gauge}
          tone="orange"
          loading={stats.loading}
          value={formatNumber(totals?.activeEnforcements)}
          hint={totals && `active now · ${formatNumber(totals.rateLimited)} rate-limited, ${formatNumber(totals.blocked)} blocked events`}
          to="/rules"
        />
        <StatCard
          label="ESP8266 devices"
          icon={Cpu}
          tone={online ? 'ok' : 'neutral'}
          loading={devices.loading}
          value={devices.error ? '—' : `${online} / ${deviceList.length}`}
          hint={
            devices.error
              ? 'Device list unavailable'
              : deviceList.length
                ? `online · last heartbeat ${formatRelative(lastHeartbeat, now)}`
                : 'No device registered yet'
          }
          to="/devices"
        />
        <StatCard
          label="Backend & database"
          icon={Server}
          tone={backendStatus === 'Operational' ? 'ok' : backendStatus === 'Degraded' ? 'warn' : 'danger'}
          loading={system.apiReachable === null}
          value={<span className="text-lg">{backendStatus}</span>}
          hint={`MongoDB ${system.database?.state ?? 'unknown'} · stream ${system.socket.connected ? 'live' : 'offline'}`}
          to="/settings"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Requests over time"
          subtitle={stats.data ? `Bucket size ${Math.round(stats.data.bucketMs / 60000)} min` : undefined}
          icon={Activity}
          state={stats}
          isEmpty={(data) => data.totals.total === 0}
          empty={
            <EmptyState
              compact
              title="No requests in this range"
              description="Connect the ESP8266 or run a scenario on the Controlled testing page to generate events."
              action={<Link className="text-sm font-medium text-sky-300 hover:text-sky-200" to="/simulator">Open controlled testing</Link>}
            />
          }
          renderChart={(data) => <TimeSeriesChart data={data.timeline} series={TIMELINE_SERIES} bucketMs={data.bucketMs} />}
          renderTable={(data) => (
            <DataTable
              columns={[
                { key: 't', label: 'Interval', render: (row) => formatBucketRange(row.t, data.bucketMs) },
                { key: 'total', label: 'Requests', align: 'right' },
                { key: 'suspicious', label: 'Flagged', align: 'right' },
                { key: 'highSeverity', label: 'High/critical', align: 'right' },
              ]}
              rows={[...data.timeline].reverse()}
            />
          )}
        />

        <ChartCard
          title="Severity distribution"
          icon={ShieldAlert}
          state={stats}
          isEmpty={(data) => data.totals.total === 0}
          empty={<EmptyState compact title="No events yet" />}
          renderChart={(data) => (
            <BarList
              items={[...data.bySeverity].reverse().map((row) => ({
                key: row.severity,
                label: SEVERITY_META[row.severity].label,
                icon: SEVERITY_META[row.severity].icon,
                value: row.count,
                color: SEVERITY_META[row.severity].bar,
                secondary: percent(row.count, data.totals.total),
                to: `/events?severity=${row.severity}`,
              }))}
            />
          )}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent security events"
            subtitle="Newest first, updated live"
            icon={ListFilter}
            actions={
              <Link to="/events" className="text-xs font-medium text-sky-300 hover:text-sky-200">
                View all events
              </Link>
            }
          />
          <AsyncContent
            state={recent}
            isEmpty={(data) => data.data.length === 0}
            empty={<EmptyState compact title="No events recorded" description="Events appear here as soon as they are persisted." />}
          >
            {(data) => <EventTable events={data.data} compact />}
          </AsyncContent>
        </Card>

        <ChartCard
          title="Most common detection signals"
          subtitle="Rules that matched most often"
          icon={TriangleAlert}
          state={stats}
          isEmpty={(data) => data.topRules.length === 0}
          empty={<EmptyState compact title="No rule matches in this range" description="Normal traffic produces no detection signals." />}
          renderChart={(data) => (
            <BarList
              items={data.topRules.map((rule) => ({
                key: rule.ruleId,
                label: rule.ruleName ?? rule.ruleId,
                title: `${rule.ruleId} · ${categoryLabel(rule.category)}`,
                value: rule.count,
                to: `/events?category=${rule.category}`,
              }))}
            />
          )}
        />
      </div>
    </>
  );
}
