import { readFileSync } from 'node:fs';
import { config } from '../config/env.js';
import { getDatabaseStatus, pingDatabase } from '../config/database.js';
import { connectedSocketClients } from '../sockets/realtime.js';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** Liveness plus dependency summary. Returns 200 while the API itself is up, even if degraded. */
export function getHealth(_req, res) {
  const database = getDatabaseStatus();
  res.json({
    data: {
      status: database.connected ? 'ok' : 'degraded',
      service: 'iot-honeypot-backend',
      version,
      environment: config.nodeEnv,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: { state: database.state, connected: database.connected },
      realtime: { connectedClients: connectedSocketClients() },
      simulatorEnabled: config.simulatorEnabled,
    },
  });
}

/** Database readiness. 503 when MongoDB is not connected so monitors can alert on it. */
export async function getDatabaseHealth(_req, res) {
  const status = getDatabaseStatus();
  let latencyMs = null;
  if (status.connected) {
    try {
      latencyMs = await pingDatabase();
    } catch {
      latencyMs = null;
    }
  }
  res.status(status.connected ? 200 : 503).json({ data: { ...status, latencyMs } });
}
