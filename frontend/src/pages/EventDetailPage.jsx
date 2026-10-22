import { ArrowLeft, Braces, Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMissions } from '../game/MissionsContext.jsx';
import { Link, useParams } from 'react-router';
import { errorCode } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { EventDetails } from '../components/events/EventDetails.jsx';
import { SourceBadge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardBody, CardHeader } from '../components/ui/Card.jsx';
import { ErrorState, LoadingState } from '../components/ui/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDateTime } from '../lib/format.js';

export default function EventDetailPage() {
  const { id } = useParams();
  const event = useApi(() => api.event(id), [id]);
  const [copied, setCopied] = useState(false);
  const { recordAction } = useMissions();

  useEffect(() => {
    if (event.data && event.data.classification !== 'normal') recordAction('investigate');
  }, [event.data, recordAction]);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Link to="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to events
      </Link>

      {event.loading && (
        <Card>
          <LoadingState rows={8} label="Loading event" />
        </Card>
      )}

      {event.error && !event.data && (
        <Card>
          <ErrorState
            title={['NOT_FOUND', 'BAD_REQUEST'].includes(errorCode(event.error.raw)) ? 'Event not found' : 'Could not load event'}
            message={event.error.message}
            onRetry={event.refetch}
          />
        </Card>
      )}

      {event.data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
                <span className="font-mono">{event.data.method}</span>
                <span className="break-all font-mono">{event.data.path}</span>
                <SourceBadge sourceType={event.data.sourceType} />
              </h1>
              <p className="mt-1 text-sm text-ink-3">
                Received {formatDateTime(event.data.timestamp)} from <span className="font-mono">{event.data.sourceIdentifier}</span>
              </p>
            </div>
            <Button size="sm" icon={copied ? Check : Copy} onClick={copyJson}>
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>

          <Card>
            <CardBody>
              <EventDetails event={event.data} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Complete normalized record"
              subtitle="Exactly what is stored in MongoDB (after redaction and normalization)"
              icon={Braces}
            />
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-ink-2">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </Card>
        </div>
      )}
    </>
  );
}
