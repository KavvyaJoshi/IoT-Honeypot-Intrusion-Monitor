import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../api/socket.js';

/** Subscribes to one or more Socket.IO events for the lifetime of the component. */
export function useSocketEvent(eventNames, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const key = [].concat(eventNames).join('|');

  useEffect(() => {
    const socket = getSocket();
    const names = key.split('|');
    const listener = (payload) => handlerRef.current(payload);
    names.forEach((name) => socket.on(name, listener));
    return () => names.forEach((name) => socket.off(name, listener));
  }, [key]);
}

/**
 * Calls `callback` at most once per `waitMs` while socket events keep arriving, so a burst of
 * 25 simulated events causes one or two refetches rather than 25.
 */
export function useThrottledSocketRefresh(eventNames, callback, waitMs = 1200) {
  const timer = useRef(null);
  const pending = useRef(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => () => clearTimeout(timer.current), []);

  useSocketEvent(eventNames, () => {
    if (timer.current) {
      pending.current = true;
      return;
    }
    callbackRef.current();
    timer.current = setTimeout(function flush() {
      if (pending.current) {
        pending.current = false;
        callbackRef.current();
        timer.current = setTimeout(flush, waitMs);
      } else {
        timer.current = null;
      }
    }, waitMs);
  });
}

/** Re-renders every `intervalMs` so relative times ("12s ago") stay current. */
export function useNow(intervalMs = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
