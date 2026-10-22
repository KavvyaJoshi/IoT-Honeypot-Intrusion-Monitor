import { DatabaseZap, ServerOff } from 'lucide-react';
import { useSystem } from '../../context/SystemContext.jsx';

/** Page-wide, actionable warning when the API or MongoDB is unavailable. */
export function SystemBanner() {
  const { apiReachable, databaseConnected, database } = useSystem();

  if (apiReachable === false) {
    return (
      <div role="alert" className="flex items-start gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-100 sm:px-6">
        <ServerOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <strong className="font-semibold">Backend API unreachable.</strong> Start it with{' '}
          <code className="rounded bg-black/30 px-1">cd backend &amp;&amp; npm run dev</code>. Data shown may be stale; the
          dashboard retries automatically.
        </p>
      </div>
    );
  }

  if (apiReachable && !databaseConnected) {
    return (
      <div role="alert" className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100 sm:px-6">
        <DatabaseZap className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <strong className="font-semibold">MongoDB is not connected</strong>
          {database?.state ? ` (${database.state})` : ''}. Events cannot be stored, so ingestion and the simulator return
          HTTP 503 until it is back. Start the MongoDB service and check <code className="rounded bg-black/30 px-1">MONGODB_URI</code>{' '}
          in <code className="rounded bg-black/30 px-1">backend/.env</code>; the backend reconnects automatically.
        </p>
      </div>
    );
  }

  return null;
}
