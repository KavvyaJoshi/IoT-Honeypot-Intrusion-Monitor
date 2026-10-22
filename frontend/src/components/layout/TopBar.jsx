import { ChevronDown, Cpu, Lock, LockOpen, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/endpoints.js';
import { SOCKET_EVENTS } from '../../api/socket.js';
import { useSystem } from '../../context/SystemContext.jsx';
import { RankChip } from '../../game/GameWidgets.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useThrottledSocketRefresh } from '../../hooks/useSocket.js';
import { StatusIndicator } from '../ui/Badge.jsx';

/** ESP8266 connectivity from heartbeats: online count, or why nothing is online. */
export function deviceChipStatus(devices, error, apiReachable) {
  if (!apiReachable || error) return { key: 'unknown', label: 'Unknown' };
  if (!devices) return { key: 'unknown', label: 'Checking' };
  if (!devices.length) return { key: 'never-connected', label: 'None' };
  const online = devices.filter((d) => d.status === 'online').length;
  if (online) return { key: 'online', label: `${online}/${devices.length} online` };
  return { key: 'offline', label: 'Offline' };
}

/** One summary of system health; the individual checks open on click. */
function SystemStatus() {
  const { apiReachable, databaseConnected, database, socket } = useSystem();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  let summary = { key: 'ok', label: 'All systems go' };
  if (apiReachable === null) summary = { key: 'unknown', label: 'Checking…' };
  else if (!apiReachable) summary = { key: 'down', label: 'Backend offline' };
  else if (!databaseConnected) summary = { key: 'down', label: 'Database offline' };
  else if (!socket.connected) summary = { key: 'degraded', label: 'Live updates paused' };

  const rows = [
    { label: 'Backend API', status: apiReachable === null ? 'unknown' : apiReachable ? 'ok' : 'down', text: apiReachable ? 'Up' : apiReachable === null ? 'Checking' : 'Down' },
    { label: 'Database (MongoDB)', status: !apiReachable ? 'unknown' : databaseConnected ? 'ok' : 'down', text: databaseConnected ? 'Connected' : database?.state ?? 'Unknown' },
    { label: 'Live updates', status: socket.connected ? 'ok' : 'degraded', text: socket.connected ? 'Streaming' : 'Reconnecting' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 hover:border-line-strong"
      >
        <StatusIndicator status={summary.key} label={summary.label} />
        <ChevronDown className="size-3.5 text-ink-3" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-xl border border-line-strong bg-surface-2 p-2 shadow-2xl">
          <ul>
            {rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm">
                <span className="text-ink-2">{row.label}</span>
                <StatusIndicator status={row.status} label={row.text} />
              </li>
            ))}
          </ul>
          <Link to="/settings" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-2.5 py-2 text-xs text-accent-ink hover:bg-surface-3">
            Full system health →
          </Link>
        </div>
      )}
    </div>
  );
}

function DevicePill() {
  const { apiReachable, databaseConnected } = useSystem();
  const devices = useApi(() => api.devices(), [databaseConnected], {
    refreshInterval: 15000,
    enabled: Boolean(apiReachable && databaseConnected),
  });
  useThrottledSocketRefresh(SOCKET_EVENTS.DEVICE_UPDATE, devices.refetch, 1000);
  const device = deviceChipStatus(devices.data?.data, devices.error, apiReachable && databaseConnected);
  return (
    <Link
      to="/devices"
      title="ESP8266 status from heartbeats"
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 hover:border-line-strong"
    >
      <Cpu className="size-3.5 text-ink-3" aria-hidden="true" />
      <span className="hidden text-xs text-ink-3 sm:inline">ESP8266</span>
      <StatusIndicator status={device.key} label={device.label} />
    </Link>
  );
}

export function TopBar({ onOpenNav }) {
  const { isAdmin, openAdminDialog, lockAdmin } = useSystem();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:gap-3 sm:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2" aria-label="System status">
        <SystemStatus />
        <DevicePill />
      </div>

      <RankChip />
      {isAdmin ? (
        <button
          type="button"
          onClick={lockAdmin}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
          title="Admin actions unlocked for this tab. Click to lock."
        >
          <LockOpen className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Admin</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openAdminDialog}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink"
          aria-label="Unlock admin"
        >
          <Lock className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Unlock</span>
        </button>
      )}
    </header>
  );
}
