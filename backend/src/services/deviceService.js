import { config } from '../config/env.js';
import { Device } from '../models/Device.js';
import { Event } from '../models/Event.js';
import { broadcast, SOCKET_EVENTS } from '../sockets/realtime.js';
import { AppError, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { interfaceForPeer, lanInterfaces } from '../utils/network.js';
import { getSettings } from './settingsService.js';

/**
 * Connectivity is derived only from heartbeats: a device is "online" when its last heartbeat
 * is newer than heartbeatTimeoutSeconds. Existing in the database does not make it online.
 */
export function computeStatus(device, now = Date.now()) {
  if (!device.lastHeartbeatAt) return 'never-connected';
  const ageMs = now - new Date(device.lastHeartbeatAt).getTime();
  return ageMs <= getSettings().heartbeatTimeoutSeconds * 1000 ? 'online' : 'offline';
}

function present(device, eventCount = 0) {
  const json = typeof device.toJSON === 'function' ? device.toJSON() : { ...device, id: String(device._id) };
  delete json._id;
  delete json.__v;
  return {
    ...json,
    status: computeStatus(json),
    heartbeatTimeoutSeconds: getSettings().heartbeatTimeoutSeconds,
    network: networkInfo(json.ipAddress),
    eventCount,
  };
}

async function eventCountsByDevice(deviceIds) {
  const rows = await Event.aggregate([
    { $match: { sourceType: 'device', deviceId: { $in: deviceIds } } },
    { $group: { _id: '$deviceId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

export async function listDevices() {
  const devices = await Device.find().sort({ deviceId: 1 }).lean();
  const counts = await eventCountsByDevice(devices.map((d) => d.deviceId));
  return devices.map((device) => present(device, counts.get(device.deviceId) ?? 0));
}

export async function getDevice(deviceId) {
  const device = await Device.findOne({ deviceId }).lean();
  if (!device) throw notFound(`Device "${deviceId}" not found`);
  const counts = await eventCountsByDevice([deviceId]);
  const recentEvents = await Event.find({ sourceType: 'device', deviceId }).sort({ timestamp: -1 }).limit(10).lean();
  return {
    ...present(device, counts.get(deviceId) ?? 0),
    recentEvents: recentEvents.map(({ _id, __v, ...rest }) => ({ id: String(_id), ...rest })),
  };
}

export async function registerDevice(input) {
  const now = new Date();
  const update = { lastSeenAt: now };
  for (const field of ['name', 'hardware', 'firmwareVersion', 'ipAddress']) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  const existing = await Device.exists({ deviceId: input.deviceId });
  const device = await Device.findOneAndUpdate(
    { deviceId: input.deviceId },
    { $set: update, $setOnInsert: { deviceId: input.deviceId, registeredAt: now } },
    { upsert: true, new: true, runValidators: true },
  );
  const result = present(device);
  broadcast(SOCKET_EVENTS.DEVICE_UPDATE, result);
  return { device: result, created: !existing };
}

export async function recordHeartbeat(input) {
  const now = new Date();
  const set = { lastHeartbeatAt: now, lastSeenAt: now };
  if (input.firmwareVersion !== undefined) set.firmwareVersion = input.firmwareVersion;
  if (input.ipAddress !== undefined) set.ipAddress = input.ipAddress;
  if (input.rssi !== undefined) set.lastRssi = input.rssi;
  if (input.uptimeMs !== undefined) set.lastUptimeMs = input.uptimeMs;
  if (input.freeHeap !== undefined) set.lastFreeHeap = input.freeHeap;

  const device = await Device.findOneAndUpdate(
    { deviceId: input.deviceId },
    { $set: set, $inc: { heartbeatCount: 1 } },
    { new: true, runValidators: true },
  );
  if (!device) {
    throw new AppError(
      404,
      'DEVICE_NOT_REGISTERED',
      `Device "${input.deviceId}" is not registered. Call POST /api/devices/register first.`,
    );
  }
  const result = present(device);
  lastKnownStatus.set(device.deviceId, result.status);
  broadcast(SOCKET_EVENTS.DEVICE_UPDATE, result);
  return result;
}

/**
 * Whether the device's last reported IP shares a subnet with one of the laptop's interfaces.
 * Sharing a subnet is necessary but not sufficient: client isolation or a firewall can still
 * block traffic between them.
 */
function networkInfo(ipAddress) {
  if (!ipAddress) return { sameSubnet: null, laptopInterface: null };
  const iface = interfaceForPeer(ipAddress);
  return iface
    ? { sameSubnet: true, laptopInterface: { name: iface.name, cidr: iface.cidr } }
    : { sameSubnet: false, laptopInterface: null };
}

export function setupInfo() {
  const interfaces = lanInterfaces();
  const baseUrls = config.publicBaseUrl
    ? [config.publicBaseUrl.replace(/\/$/, '')]
    : interfaces.filter((i) => !i.likelyVirtual).map((i) => `http://${i.address}:${config.port}`);
  const settings = getSettings();
  return {
    baseUrls,
    interfaces: interfaces.map((i) => ({ ...i, url: `http://${i.address}:${config.port}` })),
    listening: {
      host: config.host,
      port: config.port,
      lanAccessible: !['127.0.0.1', 'localhost', '::1'].includes(config.host),
    },
    endpoints: {
      register: { method: 'POST', path: '/api/devices/register' },
      heartbeat: { method: 'POST', path: '/api/devices/heartbeat' },
      ingest: { method: 'POST', path: '/api/events/ingest' },
    },
    authHeader: 'X-Device-Key',
    deviceApiKeyConfigured: Boolean(config.deviceApiKey),
    recommendedHeartbeatIntervalSeconds: settings.recommendedHeartbeatIntervalSeconds,
    heartbeatTimeoutSeconds: settings.heartbeatTimeoutSeconds,
    maxRequestBodyBytes: 8192,
  };
}

// Broadcasts a device:update when a device silently crosses the heartbeat timeout.
const lastKnownStatus = new Map();
let watcher = null;

export function startDeviceStatusWatcher(intervalMs = 10_000) {
  stopDeviceStatusWatcher();
  watcher = setInterval(async () => {
    try {
      if (Device.db.readyState !== 1) return;
      const devices = await Device.find().lean();
      for (const device of devices) {
        const status = computeStatus(device);
        const previous = lastKnownStatus.get(device.deviceId);
        lastKnownStatus.set(device.deviceId, status);
        if (previous && previous !== status) broadcast(SOCKET_EVENTS.DEVICE_UPDATE, present(device));
      }
    } catch (error) {
      logger.warn(`Device status watcher failed: ${error.message}`);
    }
  }, intervalMs);
  watcher.unref?.();
}

export function stopDeviceStatusWatcher() {
  if (watcher) clearInterval(watcher);
  watcher = null;
}
