import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

// Fail fast instead of silently queueing writes while MongoDB is unreachable. Routes that
// need the database are guarded by requireDatabase and return 503 with an actionable error.
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);

const STATE_NAMES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

const listeners = new Set();
let retryTimer = null;
let stopped = false;
let lastError = null;

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

/** Describes the connection without exposing credentials from the URI. */
export function getDatabaseStatus() {
  const { readyState, host, port, name } = mongoose.connection;
  return {
    state: STATE_NAMES[readyState] ?? 'unknown',
    connected: readyState === 1,
    host: readyState === 1 ? host : null,
    port: readyState === 1 ? port : null,
    name: readyState === 1 ? name : null,
    lastError: readyState === 1 ? null : lastError,
  };
}

export async function pingDatabase() {
  if (!isDatabaseConnected()) return null;
  const started = performance.now();
  await mongoose.connection.db.admin().ping();
  return Math.round((performance.now() - started) * 100) / 100;
}

/** Registers a callback invoked with (connected: boolean) on connection changes. */
export function onDatabaseStateChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify(connected) {
  for (const callback of listeners) {
    try {
      callback(connected);
    } catch (error) {
      logger.error('Database state listener failed', error.message);
    }
  }
}

let eventsBound = false;
function bindConnectionEvents() {
  if (eventsBound) return;
  eventsBound = true;
  mongoose.connection.on('connected', () => {
    lastError = null;
    logger.info(`MongoDB connected (database "${mongoose.connection.name}")`);
    notify(true);
  });
  mongoose.connection.on('disconnected', () => {
    if (!stopped) logger.warn('MongoDB disconnected; the driver will try to reconnect');
    notify(false);
  });
  mongoose.connection.on('error', (error) => {
    lastError = sanitizeError(error);
    logger.error(`MongoDB error: ${lastError}`);
  });
}

function sanitizeError(error) {
  // Driver messages can echo the connection string; strip any credentials defensively.
  return String(error?.message ?? error).replace(/\/\/[^@/\s]+@/g, '//***@');
}

/**
 * Connects to MongoDB without blocking server start-up. If the first attempt fails it keeps
 * retrying every retryMs, so the API stays up and reports the database as unavailable.
 */
export function connectDatabase(uri, { retryMs = 5000 } = {}) {
  stopped = false;
  bindConnectionEvents();

  const attempt = async () => {
    retryTimer = null;
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    } catch (error) {
      lastError = sanitizeError(error);
      logger.error(
        `MongoDB connection failed: ${lastError}. Is MongoDB running and is MONGODB_URI correct? Retrying in ${Math.round(retryMs / 1000)}s.`,
      );
      if (!stopped) {
        retryTimer = setTimeout(attempt, retryMs);
        retryTimer.unref?.();
      }
    }
  };

  return attempt();
}

export async function disconnectDatabase() {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  await mongoose.disconnect();
}
