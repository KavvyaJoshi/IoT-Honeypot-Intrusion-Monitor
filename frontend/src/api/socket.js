import { io } from 'socket.io-client';
import { API_BASE_URL } from './client.js';

export const SOCKET_EVENTS = Object.freeze({
  EVENT_NEW: 'event:new',
  DEVICE_UPDATE: 'device:update',
  RULES_UPDATED: 'rules:updated',
  SETTINGS_UPDATED: 'settings:updated',
  SIMULATOR_RESET: 'simulator:reset',
  DATABASE_STATUS: 'system:database',
});

let socket = null;

/** One shared, receive-only Socket.IO connection for the whole dashboard. */
export function getSocket() {
  if (!socket) {
    socket = io(API_BASE_URL || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10000,
    });
  }
  return socket;
}
