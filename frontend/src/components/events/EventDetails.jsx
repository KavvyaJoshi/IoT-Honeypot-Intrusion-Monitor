import { FlaskConical, ShieldCheck } from 'lucide-react';
import { ACTION_DESCRIPTIONS } from '../../lib/constants.js';
import { formatBytes, formatDateTime, formatDuration, humanize } from '../../lib/format.js';
import { ActionBadge, Badge, categoryLabel, ClassificationBadge, SeverityBadge, SourceBadge } from '../ui/Badge.jsx';
import { KeyValueList } from '../ui/Card.jsx';

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function Mono({ children }) {
  return <span className="break-all font-mono text-xs text-ink">{children}</span>;
}

function EvidenceList({ evidence }) {
  if (!evidence || typeof evidence !== 'object') return null;
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {Object.entries(evidence).map(([key, value]) => (
        <div key={key} className="flex gap-1.5">
          <dt className="text-ink-3">{humanize(key)}:</dt>
          <dd className="font-mono text-ink-2">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetectionList({ detections }) {
  if (!detections?.length) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-200">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        No detection rule matched this request, so it was classified as normal traffic.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {detections.map((detection, index) => (
        <li key={`${detection.ruleId}-${index}`} className="rounded-md border border-line bg-canvas/50 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{detection.ruleName ?? detection.ruleId}</span>
            <code className="text-[11px] text-ink-3">{detection.ruleId}</code>
            <SeverityBadge severity={detection.severity} />
            <Badge className="bg-surface-3 text-ink-2 ring-line-strong">recommends: {detection.recommendedAction}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-ink-2">{detection.reason}</p>
          <EvidenceList evidence={detection.evidence} />
        </li>
      ))}
    </ul>
  );
}

export function EventDetails({ event, compact = false }) {
  const headers = Object.entries(event.metadata?.headers ?? {});
  const escalation = event.detectionReasons?.filter((reason) => reason.startsWith('Severity escalated')) ?? [];

  return (
    <div className={`grid gap-6 ${compact ? 'lg:grid-cols-2' : 'xl:grid-cols-[3fr_2fr]'}`}>
      <div className="space-y-6">
        <Section title="Verdict">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={event.severity} />
            <ClassificationBadge classification={event.classification} />
            <ActionBadge action={event.actionTaken} />
            <Badge className="bg-surface-3 text-ink-2 ring-line-strong">{categoryLabel(event.category)}</Badge>
          </div>
          <p className="mt-2 text-sm text-ink-2">{ACTION_DESCRIPTIONS[event.actionTaken]}</p>
          {escalation.map((reason) => (
            <p key={reason} className="mt-1 text-sm text-amber-200">
              {reason}
            </p>
          ))}
        </Section>

        <Section title="Why it was classified this way">
          <DetectionList detections={event.detections} />
        </Section>

        {!compact && (
          <Section title="Request metadata">
            <KeyValueList
              items={[
                { label: 'Method', value: <Mono>{event.method}</Mono> },
                { label: 'Path', value: <Mono>{event.path}</Mono> },
                { label: 'Query (redacted)', value: event.query ? <Mono>{event.query}</Mono> : null },
                { label: 'Response status', value: event.responseStatus },
                { label: 'Login result', value: event.loginResult, hidden: !event.loginResult },
                { label: 'User agent', value: event.userAgent ? <Mono>{event.userAgent}</Mono> : null },
                { label: 'Body size', value: event.metadata?.bodyBytes !== undefined ? formatBytes(event.metadata.bodyBytes) : null },
                { label: 'Path length', value: event.metadata?.pathLength },
              ]}
            />
          </Section>
        )}
      </div>

      <div className="space-y-6">
        <Section title="Source">
          <KeyValueList
            items={[
              {
                label: 'Origin',
                value: (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <SourceBadge sourceType={event.sourceType} />
                    {event.simulated && <span className="text-xs text-fuchsia-300">Simulated test traffic, not a real attack</span>}
                  </span>
                ),
              },
              { label: 'Source', value: <Mono>{event.sourceIdentifier}</Mono> },
              { label: 'Device', value: event.deviceId ? <Mono>{event.deviceId}</Mono> : null },
              { label: 'Scenario', value: event.metadata?.scenario, hidden: !event.metadata?.scenario },
              { label: 'Received', value: formatDateTime(event.timestamp) },
              { label: 'Device clock', value: event.metadata?.deviceObservedAt ? formatDateTime(event.metadata.deviceObservedAt) : null, hidden: !event.metadata?.deviceObservedAt },
              { label: 'Device uptime', value: formatDuration(event.metadata?.deviceUptimeMs), hidden: event.metadata?.deviceUptimeMs === undefined },
              { label: 'Correlation id', value: event.correlationId ? <Mono>{event.correlationId}</Mono> : null, hidden: !event.correlationId },
            ]}
          />
          {compact && (
            <p className="mt-3 text-xs text-ink-3">
              <Mono>{event.method}</Mono> <Mono>{event.path}</Mono>
              {event.query && <Mono>?{event.query}</Mono>} → {event.responseStatus ?? 'no status'}
            </p>
          )}
        </Section>

        {!compact && (
          <Section title="Headers (sensitive values redacted)">
            {headers.length ? (
              <ul className="divide-y divide-line rounded-md border border-line text-xs">
                {headers.map(([name, value]) => (
                  <li key={name} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-1.5">
                    <span className="truncate font-mono text-ink-3">{name}</span>
                    <span className={`break-all font-mono ${value === '[REDACTED]' ? 'text-amber-300' : 'text-ink-2'}`}>{value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No headers were reported.</p>
            )}
            <p className="mt-2 text-xs text-ink-3">
              Passwords, tokens, cookies and authorization headers are redacted or discarded before the event is stored.
            </p>
          </Section>
        )}

        {event.simulated && !compact && (
          <p className="flex items-start gap-2 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2.5 text-sm text-fuchsia-100">
            <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Generated by the controlled simulator using a reserved documentation IP range (RFC 5737). No traffic was sent
            to any other host.
          </p>
        )}
      </div>
    </div>
  );
}
