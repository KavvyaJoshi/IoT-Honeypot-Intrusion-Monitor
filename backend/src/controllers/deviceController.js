import {
  getDevice,
  listDevices,
  recordHeartbeat,
  registerDevice,
  setupInfo,
} from '../services/deviceService.js';
import { getSettings } from '../services/settingsService.js';
import { getDeviceActivity } from '../services/statsService.js';

export async function list(_req, res) {
  const devices = await listDevices();
  res.json({ data: devices, meta: { heartbeatTimeoutSeconds: getSettings().heartbeatTimeoutSeconds } });
}

export async function getOne(req, res) {
  res.json({ data: await getDevice(req.validated.params.id) });
}

export async function register(req, res) {
  const { device, created } = await registerDevice(req.validated.body);
  res.status(created ? 201 : 200).json({
    data: {
      deviceId: device.deviceId,
      created,
      status: device.status,
      recommendedHeartbeatIntervalSeconds: getSettings().recommendedHeartbeatIntervalSeconds,
    },
  });
}

export async function heartbeat(req, res) {
  const device = await recordHeartbeat(req.validated.body);
  res.json({
    data: {
      deviceId: device.deviceId,
      status: device.status,
      serverTime: new Date().toISOString(),
      nextHeartbeatSeconds: getSettings().recommendedHeartbeatIntervalSeconds,
    },
  });
}

export function setup(_req, res) {
  res.json({ data: setupInfo() });
}

export async function activity(req, res) {
  res.json({ data: await getDeviceActivity(req.validated.query) });
}
