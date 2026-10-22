import { Lock, LockOpen, Menu } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../api/endpoints.js';
import { SOCKET_EVENTS } from '../../api/socket.js';
import { useSystem } from '../../context/SystemContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useThrottledSocketRefresh } from '../../hooks/useSocket.js';
import { StatusIndicator } from '../ui/Badge.jsx';

/** ESP8266 connectivity from heartbeats: online count, or why nothing is online. */
function deviceChipStatus(devices, error, apiReachable) {
  if (!apiReachable || error) return { key: 'unknown', label: 'Unknown' };
  if (!devices) return { key: 'unknown', label: 'Checking' };
  if (!devices.length) return { key: 'never-connected', label: 'None' };
  const online = devices.filter((d) => d.status === 'online').length;
  if (online) return { key: 'online', label: `${online}/${devices.length} online` };
  return { key: 'offline', label: 'Offline' };
}

function ConnectionChip({ label, status, title }) {
  return (
    <span title={title} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-canvas/60 px-2 py-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</span>
      <StatusIndicator status={status.key} label={status.label} />
    </span>
  );
}

export function TopBar({ onOpenNav }) {
  const { apiReachable, databaseConnected, database, socket, isAdmin, openAdminDialog, lockAdmin } = useSystem();

  const apiStatus =
    apiReachable === null ? { key: 'unknown', label: 'Checking' } : apiReachable ? { key: 'ok', label: 'Up' } : { key: 'down', label: 'Down' };
  const db = !apiReachable
    ? { key: 'unknown', label: 'Unknown' }
    : databaseConnected
      ? { key: 'ok', label: 'Connected' }
      : { key: 'down', label: database?.state === 'connecting' ? 'Connecting' : 'Down' };
  const live = socket.connected ? { key: 'ok', label: 'Live' } : { key: 'degraded', label: 'Offline' };

  const devices = useApi(() => api.devices(), [databaseConnected], { refreshInterval: 15000, enabled: Boolean(apiReachable && databaseConnected) });
  useThrottledSocketRefresh(SOCKET_EVENTS.DEVICE_UPDATE, devices.refetch, 1000);
  const device = deviceChipStatus(devices.data?.data, devices.error, apiReachable && databaseConnected);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        className="rounded p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="System status">
        <ConnectionChip label="API" status={apiStatus} title="Backend REST API reachability" />
        <ConnectionChip label="DB" status={db} title="MongoDB connection as reported by the backend" />
        <ConnectionChip label="Stream" status={live} title="Socket.IO real-time connection" />
        <Link to="/devices" className="shrink-0 rounded-md hover:bg-surface-2">
          <ConnectionChip label="ESP8266" status={device} title="Heartbeat-based device status. Open the Devices page." />
        </Link>
      </div>

      {isAdmin ? (
        <button
          type="button"
          onClick={lockAdmin}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
          title="Admin actions unlocked for this tab. Click to lock."
        >
          <LockOpen className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Admin unlocked</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openAdminDialog}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink"
        >
          <Lock className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Unlock admin</span>
        </button>
      )}
    </header>
  );
}
