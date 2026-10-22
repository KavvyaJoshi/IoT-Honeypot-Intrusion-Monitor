import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { useToast } from '../components/ui/Toast.jsx';
import { useSystem } from '../context/SystemContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { buildFacts, MISSIONS, rankFor, TOTAL_XP } from './missions.js';

const STORAGE_KEY = 'honeypot.missions.v1';

// Progress is a per-browser convenience (local storage), so it survives a simulator reset.
function readProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { earned: parsed.earned ?? {}, actions: parsed.actions ?? [] };
  } catch {
    return { earned: {}, actions: [] };
  }
}

function writeProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage unavailable: progress lasts until reload.
  }
}

const EMPTY = {
  ready: false,
  missions: MISSIONS.map((m) => ({ ...m, done: false, earnedAt: null })),
  xp: 0,
  totalXp: TOTAL_XP,
  completed: 0,
  rank: rankFor(0),
  celebration: null,
  recordAction: () => {},
  resetProgress: () => {},
};

const MissionsContext = createContext(EMPTY);

export function MissionsProvider({ children }) {
  const { apiReachable, databaseConnected } = useSystem();
  const { notify } = useToast();
  const [progress, setProgress] = useState(readProgress);
  const [celebration, setCelebration] = useState(null);
  const initialized = useRef(false);

  const data = useApi(
    () =>
      Promise.all([
        api.detectionStats({ range: 'all' }),
        api.eventStats({ range: 'all' }),
        api.devices(),
        api.rules(),
      ]).then(([detection, overview, devices, rules]) => ({ detection, overview, devices: devices.data, rules })),
    [databaseConnected],
    { enabled: Boolean(apiReachable && databaseConnected) },
  );
  useThrottledSocketRefresh(
    [SOCKET_EVENTS.EVENT_NEW, SOCKET_EVENTS.DEVICE_UPDATE, SOCKET_EVENTS.RULES_UPDATED],
    data.refetch,
    2500,
  );

  const actions = useMemo(() => new Set(progress.actions), [progress.actions]);

  // Award newly completed missions. Missions already complete on first load are recorded quietly.
  useEffect(() => {
    if (!data.data) return;
    const facts = buildFacts(data.data, actions);
    const fresh = MISSIONS.filter((m) => !progress.earned[m.id] && m.check(facts));
    if (fresh.length) {
      const now = new Date().toISOString();
      const next = { ...progress, earned: { ...progress.earned } };
      fresh.forEach((m) => {
        next.earned[m.id] = now;
      });
      setProgress(next);
      writeProgress(next);
      if (initialized.current) {
        fresh.forEach((m) =>
          notify({ tone: 'reward', title: `Mission complete: ${m.title}`, message: `+${m.xp} XP. ${m.goal}`, duration: 7000 }),
        );
        const last = fresh.at(-1);
        setCelebration({ id: last.id, title: last.title, xp: fresh.reduce((sum, m) => sum + m.xp, 0), at: Date.now() });
      }
    }
    initialized.current = true;
  }, [data.data, actions, progress, notify]);

  const recordAction = useCallback((name) => {
    setProgress((current) => {
      if (current.actions.includes(name)) return current;
      const next = { ...current, actions: [...current.actions, name] };
      writeProgress(next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    const next = { earned: {}, actions: [] };
    initialized.current = false;
    setProgress(next);
    writeProgress(next);
  }, []);

  const value = useMemo(() => {
    const missions = MISSIONS.map((m) => ({ ...m, done: Boolean(progress.earned[m.id]), earnedAt: progress.earned[m.id] ?? null }));
    const xp = missions.filter((m) => m.done).reduce((sum, m) => sum + m.xp, 0);
    return {
      ready: Boolean(data.data),
      missions,
      xp,
      totalXp: TOTAL_XP,
      completed: missions.filter((m) => m.done).length,
      rank: rankFor(xp),
      celebration,
      recordAction,
      resetProgress,
    };
  }, [progress, data.data, celebration, recordAction, resetProgress]);

  return <MissionsContext.Provider value={value}>{children}</MissionsContext.Provider>;
}

export function useMissions() {
  return useContext(MissionsContext);
}
