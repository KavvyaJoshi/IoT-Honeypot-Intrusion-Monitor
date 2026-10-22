import { useEffect, useRef, useState } from 'react';
import { SOCKET_EVENTS } from '../../api/socket.js';
import { useSystem } from '../../context/SystemContext.jsx';
import { useMissions } from '../../game/MissionsContext.jsx';
import { useSocketEvent } from '../../hooks/useSocket.js';
import { describeEvent } from '../../lib/describe.js';

const ALERT_MS = 15000;
const PARTY_MS = 3500;

/**
 * Pip's mood and what Pip wants to say, derived from real system state:
 * - sleep: backend or database offline
 * - party: a mission was just completed
 * - alert: a flagged event arrived in the last few seconds
 * - calm:  otherwise
 */
export function useMascot() {
  const { apiReachable, databaseConnected } = useSystem();
  const { celebration } = useMissions();
  const [alertEvent, setAlertEvent] = useState(null);
  const [partying, setPartying] = useState(false);
  const [message, setMessage] = useState(null);
  const alertTimer = useRef(null);

  useSocketEvent(SOCKET_EVENTS.EVENT_NEW, (event) => {
    if (event.classification === 'normal') return;
    setAlertEvent(event);
    const high = event.severity === 'high' || event.severity === 'critical';
    setMessage({
      id: `alert-${event.id}`,
      tone: high ? 'danger' : 'warn',
      text: `${high ? 'Whoa!' : 'Heads up:'} ${describeEvent(event)}${event.simulated ? ' (simulated)' : ''}.`,
      to: `/events/${event.id}`,
    });
    clearTimeout(alertTimer.current);
    alertTimer.current = setTimeout(() => setAlertEvent(null), ALERT_MS);
  });

  useEffect(() => () => clearTimeout(alertTimer.current), []);

  useEffect(() => {
    if (!celebration) return undefined;
    // The toast already announces the mission; Pip just celebrates (one message, not two).
    setPartying(true);
    const timer = setTimeout(() => setPartying(false), PARTY_MS);
    return () => clearTimeout(timer);
  }, [celebration]);

  const offline = apiReachable === false || (apiReachable && !databaseConnected);
  useEffect(() => {
    if (offline) {
      setMessage({
        id: `offline-${apiReachable}`,
        tone: 'warn',
        text: apiReachable === false ? "I can't reach the backend. Napping until it's back." : "The database is offline, so I can't store anything right now.",
      });
    }
  }, [offline, apiReachable]);

  let mood = 'calm';
  if (offline) mood = 'sleep';
  else if (partying) mood = 'party';
  else if (alertEvent) mood = 'alert';

  return { mood, message, alertEvent };
}
