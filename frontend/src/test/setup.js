import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// jsdom lacks these browser APIs used by Recharts' ResponsiveContainer.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverStub;

// The real Socket.IO client is never opened in tests.
vi.mock('../api/socket.js', () => {
  const listeners = new Map();
  const socket = {
    connected: false,
    io: { on() {}, off() {}, engine: null },
    on(name, fn) {
      listeners.set(name, [...(listeners.get(name) ?? []), fn]);
    },
    off(name, fn) {
      listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn));
    },
    emitLocal(name, payload) {
      (listeners.get(name) ?? []).forEach((fn) => fn(payload));
    },
  };
  return {
    getSocket: () => socket,
    SOCKET_EVENTS: {
      EVENT_NEW: 'event:new',
      DEVICE_UPDATE: 'device:update',
      RULES_UPDATED: 'rules:updated',
      SETTINGS_UPDATED: 'settings:updated',
      SIMULATOR_RESET: 'simulator:reset',
      DATABASE_STATUS: 'system:database',
    },
  };
});
