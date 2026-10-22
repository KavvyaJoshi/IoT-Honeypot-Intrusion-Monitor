import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_COLORS } from '../../lib/constants.js';
import { formatBucketRange, formatBucketTick, formatNumber } from '../../lib/format.js';
import { ChartLegend } from './ChartCard.jsx';

function SeriesTooltip({ active, payload, label, bucketMs, series }) {
  if (!active || !payload?.length) return null;
  const values = new Map(payload.map((entry) => [entry.dataKey, entry.value]));
  return (
    <div className="min-w-44 rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-ink">{formatBucketRange(label, bucketMs)}</p>
      <ul className="space-y-1">
        {series.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}
            </span>
            <span className="tabular font-medium text-ink">{formatNumber(values.get(s.key) ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Time series on a single y-axis. Series: [{ key, label, color, type: 'area' | 'line' | 'bar' }].
 * Bars can be stacked by passing stacked; only the top segment gets rounded corners.
 */
export function TimeSeriesChart({ data, series, bucketMs, height = 240, stacked = false }) {
  const lastBarKey = [...series].reverse().find((s) => s.type === 'bar')?.key;
  return (
    <div>
      <ChartLegend series={series} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis
              dataKey="t"
              tickFormatter={(value) => formatBucketTick(value, bucketMs)}
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={series.some((s) => s.type === 'bar') ? { fill: 'rgb(148 163 184 / 0.08)' } : { stroke: CHART_COLORS.tick, strokeWidth: 1 }}
              content={<SeriesTooltip bucketMs={bucketMs} series={series} />}
              isAnimationActive={false}
            />
            {series.map((s) => {
              if (s.type === 'bar') {
                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId={stacked ? 'stack' : undefined}
                    fill={s.color}
                    stroke="#0f0f0f"
                    strokeWidth={stacked ? 1 : 0}
                    radius={!stacked || s.key === lastBarKey ? [4, 4, 0, 0] : 0}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                );
              }
              if (s.type === 'line') {
                return (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: '#0f0f0f', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                );
              }
              return (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="monotone"
                  stroke={s.color}
                  strokeWidth={2}
                  fill={s.color}
                  fillOpacity={0.14}
                  activeDot={{ r: 4, stroke: '#0f0f0f', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
