import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAdminToken, setAdminToken } from '../api/client.js';
import { api } from '../api/endpoints.js';
import { getSocket, SOCKET_EVENTS } from '../api/socket.js';

const SystemContext = createContext(null);
const HEALTH_POLL_MS = 15000;

/**
 * Global connection state: backend reachability (health polling), MongoDB state (health +
 * live socket notifications), Socket.IO connectivity, and the admin session.
 */
export function SystemProvider({ children }) {
  const [health, setHealth] = useState(null);
  const [apiReachable, setApiReachable] = useState(null);
  const [apiLatencyMs, setApiLatencyMs] = useState(null);
  const [database, setDatabase] = useState(null);
  const [socketState, setSocketState] = useState({ connected: false, transport: null });
  const [adminToken, setAdminTokenState] = useState(getAdminToken());

  const refreshHealth = useCallback(async () => {
    const started = performance.now();
    try {
      const data = await api.health();
      setApiLatencyMs(Math.round(performance.now() - started));
      setHealth(data);
      setApiReachable(true);
      setDatabase((current) => ({ ...current, ...data.database }));
    } catch {
      setApiReachable(false);
      setApiLatencyMs(null);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const timer = setInterval(refreshHealth, HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshHealth]);

  useEffect(() => {
    const socket = getSocket();
    const update = () =>
      setSocketState({ connected: socket.connected, transport: socket.io.engine?.transport?.name ?? null });
    const onDatabase = (status) => setDatabase(status);
    const onConnect = () => {
      update();
      refreshHealth();
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', update);
    socket.io.on('reconnect', update);
    socket.on(SOCKET_EVENTS.DATABASE_STATUS, onDatabase);
    update();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', update);
      socket.io.off('reconnect', update);
      socket.off(SOCKET_EVENTS.DATABASE_STATUS, onDatabase);
    };
  }, [refreshHealth]);

  const unlockAdmin = useCallback(async (token) => {
    await api.verifyAdmin(token);
    setAdminToken(token);
    setAdminTokenState(token);
  }, []);

  const lockAdmin = useCallback(() => {
    setAdminToken('');
    setAdminTokenState('');
  }, []);

  const value = useMemo(
    () => ({
      health,
      apiReachable,
      apiLatencyMs,
      database,
      databaseConnected: Boolean(database?.connected),
      socket: socketState,
      simulatorEnabled: health?.simulatorEnabled ?? false,
      refreshHealth,
      isAdmin: Boolean(adminToken),
      unlockAdmin,
      lockAdmin,
    }),
    [health, apiReachable, apiLatencyMs, database, socketState, adminToken, unlockAdmin, lockAdmin, refreshHealth],
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (!context) throw new Error('useSystem must be used inside <SystemProvider>');
  return context;
}

export { SystemContext };
