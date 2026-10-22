import http from 'node:http';
import { createApp } from './app.js';
import { corsOriginOption } from './config/cors.js';
import { config } from './config/env.js';
import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus,
  onDatabaseStateChange,
} from './config/database.js';
import { initializeStores, startStateSweeper, stopStateSweeper } from './services/bootstrap.js';
import { startDeviceStatusWatcher, stopDeviceStatusWatcher } from './services/deviceService.js';
import { startRetentionJob, stopRetentionJob } from './services/retentionService.js';
import { attachSocketServer, broadcast, closeSocketServer, SOCKET_EVENTS } from './sockets/realtime.js';
import { logger } from './utils/logger.js';
import { lanInterfaces } from './utils/network.js';

const app = createApp();
const server = http.createServer(app);

attachSocketServer(server, { corsOrigin: corsOriginOption(config), getStatus: getDatabaseStatus });

onDatabaseStateChange((connected) => {
  broadcast(SOCKET_EVENTS.DATABASE_STATUS, getDatabaseStatus());
  if (connected) {
    initializeStores().catch((error) => logger.error(`Failed to load settings/rules: ${error.message}`));
  }
});

if (!config.deviceApiKey) logger.warn('DEVICE_API_KEY is not set: device registration, heartbeat and ingestion are disabled.');
if (!config.adminToken) logger.warn('ADMIN_TOKEN is not set: simulator, rule and settings changes are disabled.');
if (config.isProduction && config.simulatorEnabled) logger.warn('SIMULATOR_ENABLED=true in production.');

server.listen(config.port, config.host, () => {
  logger.info(`API listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
  logger.info(
    `Allowed dashboard origins: ${config.corsOrigins.join(', ') || '(none)'}` +
      (config.corsAllowLanOrigins ? ` + this laptop's LAN IPs on ports ${config.lanFrontendPorts.join('/')}` : ''),
  );
  logNetworkInfo();
});

function logNetworkInfo() {
  const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
  if (loopbackOnly) {
    logger.info('Laptop-only mode: the ESP8266 cannot reach this API (simulator still works). Set HOST=0.0.0.0 to accept LAN devices.');
    return;
  }
  const interfaces = lanInterfaces();
  if (!interfaces.length) {
    logger.warn('No LAN IPv4 address found. Connect to the hotspot/Wi-Fi; the simulator still works on this laptop.');
    return;
  }
  for (const iface of interfaces) {
    logger.info(
      `ESP8266 backend URL candidate: http://${iface.address}:${config.port}  [${iface.name}${iface.cidr ? `, ${iface.cidr}` : ''}${iface.likelyVirtual ? ', likely virtual adapter - not for the ESP8266' : ''}]`,
    );
  }
  logger.info(
    'The API is reachable by other devices on these networks unless Windows Firewall blocks it. Allow port ' +
      `${config.port} only for the local subnet or the ESP8266's IP (see docs/NETWORKING.md); never disable the firewall.`,
  );
}

server.on('error', (error) => {
  logger.error(
    error.code === 'EADDRINUSE'
      ? `Port ${config.port} is already in use. Stop the other process or change PORT in backend/.env.`
      : `HTTP server error: ${error.message}`,
  );
  process.exit(1);
});

connectDatabase(config.mongoUri, { retryMs: config.mongoRetryMs });
startDeviceStatusWatcher();
startRetentionJob();
startStateSweeper();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  stopDeviceStatusWatcher();
  stopRetentionJob();
  stopStateSweeper();
  await closeSocketServer();
  server.close();
  await disconnectDatabase().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error(`Unhandled promise rejection: ${reason?.stack ?? reason}`));
