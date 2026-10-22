import { Activity, Cpu, Gauge, Route, ShieldAlert, Tags, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { BarList } from '../components/charts/BarList.jsx';
import { ChartCard, DataTable } from '../components/charts/ChartCard.jsx';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart.jsx';
import { categoryLabel } from '../components/ui/Badge.jsx';
import { SketchPlanet } from '../components/doodles/Doodles.jsx';
import { PageHeader } from '../components/ui/Card.jsx';
import { SegmentedControl, SelectField } from '../components/ui/Controls.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { useThrottledSocketRefresh } from '../hooks/useSocket.js';
import {
  CHART_COLORS,
  DEVICE_SERIES_COLORS,
  RANGE_OPTIONS,
  SEVERITY_META,
  SOURCE_FILTER_OPTIONS,
} from '../lib/constants.js';
import { formatBucketRange } from '../lib/format.js';

const ACTION_SERIES = [
  { key: 'rateLimited', label: 'Rate-limited (detection)', color: CHART_COLORS.rateLimited, type: 'bar' },
  { key: 'logged', label: 'Logged alerts', color: CHART_COLORS.logged, type: 'bar' },
  { key: 'blocked', label: 'Blocked', color: CHART_COLORS.blocked, type: 'bar' },
  { key: 'apiRateLimited', label: 'API 429 (abuse protection)', color: CHART_COLORS.apiRateLimited, type: 'bar' },
];

function timelineTable(data, columns, rows = data.timeline) {
  return (
    <DataTable
      columns={[{ key: 't', label: 'Interval', render: (row) => formatBucketRange(row.t, data.bucketMs) }, ...columns]}
      rows={[...rows].reverse()}
    />
  );
}

/** Colours follow the device id (alphabetical order), never its rank; the simulator is always violet. */
function deviceSeries(series) {
  const devices = series
    .filter((s) => s.sourceType === 'device')
    .map((s) => s.key)
    .sort();
  return series.map((s) => ({
    key: s.key,
    label: s.label,
    type: 'line',
    color: s.sourceType === 'simulator' ? CHART_COLORS.simulator : DEVICE_SERIES_COLORS[devices.indexOf(s.key) % DEVICE_SERIES_COLORS.length],
  }));
}

const noData = (title = 'No data in this range') => <EmptyState compact title={title} description="Widen the time range or generate traffic." />;

export default function AnalyticsPage() {
  const [range, setRange] = useState('24h');
  const [source, setSource] = useState('');
  const sourceType = source || undefined;

  const overview = useApi(() => api.eventStats({ range, sourceType }), [range, sourceType]);
  const detection = useApi(() => api.detectionStats({ range, sourceType }), [range, sourceType]);
  const activity = useApi(() => api.deviceActivity({ range }), [range]);

  useThrottledSocketRefresh([SOCKET_EVENTS.EVENT_NEW, SOCKET_EVENTS.SIMULATOR_RESET], () => {
    overview.refetch();
    detection.refetch();
    activity.refetch();
  }, 3000);

  const isEmpty = (data) => data.totals.total === 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="The long view: how much traffic, what kind of invaders, and what the rules did about them. Every chart has a table view."
        doodle={<SketchPlanet className="w-full" />}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <SegmentedControl label="Time range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
        <SelectField label="Source" hideLabel value={source} onChange={setSource} options={SOURCE_FILTER_OPTIONS} className="w-44" />
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line xl:grid-cols-2 *:rounded-none *:border-0">
        <ChartCard
          title="Request volume over time"
          icon={Activity}
          state={overview}
          isEmpty={isEmpty}
          empty={noData()}
          renderChart={(data) => (
            <TimeSeriesChart
              data={data.timeline}
              bucketMs={data.bucketMs}
              series={[{ key: 'total', label: 'Requests', color: CHART_COLORS.total, type: 'bar' }]}
            />
          )}
          renderTable={(data) => timelineTable(data, [{ key: 'total', label: 'Requests', align: 'right' }])}
        />

        <ChartCard
          title="Suspicious events over time"
          subtitle="Events classified suspicious or high risk"
          icon={TriangleAlert}
          state={overview}
          isEmpty={isEmpty}
          empty={noData()}
          renderChart={(data) => (
            <TimeSeriesChart
              data={data.timeline}
              bucketMs={data.bucketMs}
              series={[{ key: 'suspicious', label: 'Flagged events', color: CHART_COLORS.flagged, type: 'bar' }]}
            />
          )}
          renderTable={(data) =>
            timelineTable(data, [
              { key: 'suspicious', label: 'Flagged', align: 'right' },
              { key: 'highSeverity', label: 'High/critical', align: 'right' },
            ])
          }
        />

        <ChartCard
          title="Rate-limit and enforcement activity"
          subtitle="Detection decisions vs. HTTP API rate limiting"
          icon={Gauge}
          state={detection}
          isEmpty={(data) => data.actionTimeline.every((p) => !p.logged && !p.rateLimited && !p.blocked && !p.apiRateLimited)}
          empty={noData('No logged, rate-limited or blocked events in this range')}
          renderChart={(data) => <TimeSeriesChart data={data.actionTimeline} bucketMs={data.bucketMs} series={ACTION_SERIES} stacked />}
          renderTable={(data) =>
            timelineTable(
              data,
              ACTION_SERIES.map((s) => ({ key: s.key, label: s.label, align: 'right' })),
              data.actionTimeline,
            )
          }
        />

        <ChartCard
          title="Activity by source"
          subtitle="Events reported per ESP8266 device, plus simulator traffic"
          icon={Cpu}
          state={activity}
          isEmpty={(data) => data.series.length === 0}
          empty={noData('No device or simulator events in this range')}
          renderChart={(data) => <TimeSeriesChart data={data.timeline} bucketMs={data.bucketMs} series={deviceSeries(data.series)} />}
          renderTable={(data) => timelineTable(data, data.series.map((s) => ({ key: s.key, label: s.label, align: 'right' })))}
        />

        <ChartCard
          title="Severity distribution"
          icon={ShieldAlert}
          state={overview}
          isEmpty={isEmpty}
          empty={noData()}
          renderChart={(data) => (
            <BarList
              items={[...data.bySeverity].reverse().map((row) => ({
                key: row.severity,
                label: SEVERITY_META[row.severity].label,
                icon: SEVERITY_META[row.severity].icon,
                value: row.count,
                color: SEVERITY_META[row.severity].bar,
                to: `/events?severity=${row.severity}`,
              }))}
            />
          )}
        />

        <ChartCard
          title="Top detection categories"
          icon={Tags}
          state={overview}
          isEmpty={(data) => data.byCategory.length === 0}
          empty={noData('No flagged events in this range')}
          renderChart={(data) => (
            <BarList
              items={data.byCategory.map((row) => ({
                key: row.category,
                label: categoryLabel(row.category),
                value: row.count,
                to: `/events?category=${row.category}`,
              }))}
            />
          )}
        />

        <ChartCard
          className="xl:col-span-2"
          title="Most frequently requested paths"
          subtitle="Top 10 paths with the number of flagged requests"
          icon={Route}
          state={overview}
          isEmpty={(data) => data.topPaths.length === 0}
          empty={noData()}
          renderChart={(data) => (
            <BarList
              items={data.topPaths.map((row) => ({
                key: row.path,
                label: row.path,
                mono: true,
                value: row.count,
                secondary: row.suspicious ? `${row.suspicious} flagged` : undefined,
                to: `/events?search=${encodeURIComponent(row.path)}`,
              }))}
            />
          )}
        />
      </div>
    </>
  );
}
