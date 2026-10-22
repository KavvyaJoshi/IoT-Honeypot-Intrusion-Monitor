import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';

export const SOCKET_EVENTS = Object.freeze({
  EVENT_NEW: 'event:new',
  DEVICE_UPDATE: 'device:update',
  RULES_UPDATED: 'rules:updated',
  SETTINGS_UPDATED: 'settings:updated',
  SIMULATOR_RESET: 'simulator:reset',
  DATABASE_STATUS: 'system:database',
});

let io = null;

/**
 * Attaches a broadcast-only Socket.IO server. Dashboard clients only listen; no inbound
 * client messages are handled, so sockets cannot be used to inject events.
 */
export function attachSocketServer(httpServer, { corsOrigin, getStatus }) {
  io = new Server(httpServer, {
    serveClient: false,
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1024,
  });
  io.on('connection', (socket) => {
    logger.debug(`Socket client connected (${io.engine.clientsCount} total)`);
    if (getStatus) socket.emit(SOCKET_EVENTS.DATABASE_STATUS, getStatus());
  });
  return io;
}

export function broadcast(eventName, payload) {
  io?.emit(eventName, payload);
}

export function connectedSocketClients() {
  return io?.engine?.clientsCount ?? 0;
}

export async function closeSocketServer() {
  if (!io) return;
  const server = io;
  io = null;
  await server.close();
}
