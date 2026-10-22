import { ChartColumn, Table2 } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader } from '../ui/Card.jsx';
import { AsyncContent, Skeleton } from '../ui/States.jsx';

/**
 * Card wrapper for a chart with a chart/table toggle, so every value is readable without
 * hovering and without relying on colour.
 */
export function ChartCard({ title, subtitle, icon, state, isEmpty, empty, renderChart, renderTable, height = 260, className = '' }) {
  const [view, setView] = useState('chart');
  const toggle = renderTable ? (
    <div className="inline-flex rounded-md border border-line-strong bg-canvas p-0.5" role="group" aria-label={`${title} view`}>
      {[
        { id: 'chart', label: 'Chart', Icon: ChartColumn },
        { id: 'table', label: 'Table', Icon: Table2 },
      ].map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          onClick={() => setView(id)}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
            view === id ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink'
          }`}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} actions={toggle} />
      <AsyncContent
        state={state}
        isEmpty={isEmpty}
        empty={empty}
        compact
        loading={
          <div className="p-4" style={{ height }}>
            <Skeleton className="h-full w-full" />
          </div>
        }
      >
        {(data) => (
          <div className="p-4">{view === 'table' && renderTable ? renderTable(data) : renderChart(data)}</div>
        )}
      </AsyncContent>
    </Card>
  );
}

/** Plain accessible table used for chart table views. */
export function DataTable({ columns, rows, maxHeight = 320 }) {
  return (
    <div className="overflow-auto rounded border border-line" style={{ maxHeight }}>
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-surface-2 text-ink-3">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-3 py-2 font-medium ${column.align === 'right' ? 'text-right' : ''}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={row.key ?? index} className="text-ink-2">
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-1.5 ${column.align === 'right' ? 'tabular text-right' : ''}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** HTML legend; always shown for two or more series so identity never relies on colour alone. */
export function ChartLegend({ series }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className={s.type === 'line' ? 'h-0.5 w-3.5 rounded' : 'size-2.5 rounded-sm'}
            style={{ backgroundColor: s.color }}
            aria-hidden="true"
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
