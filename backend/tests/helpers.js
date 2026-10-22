import mongoose from 'mongoose';
import { resetDetectionState } from '../src/detection/state.js';
import { Device } from '../src/models/Device.js';
import { Event } from '../src/models/Event.js';
import { Rule } from '../src/models/Rule.js';
import { Setting } from '../src/models/Setting.js';
import { resetApiRateLimitRecords } from '../src/services/apiRateLimitService.js';
import { initializeStores } from '../src/services/bootstrap.js';
import { resetRuleCache } from '../src/services/ruleService.js';
import { resetSettingsCache } from '../src/services/settingsService.js';

export const DEVICE_KEY = process.env.DEVICE_API_KEY;
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
export const deviceHeaders = { 'X-Device-Key': DEVICE_KEY };
export const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

export async function connectTestDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch (error) {
    throw new Error(
      `API tests need a running MongoDB at ${process.env.MONGODB_URI} (set MONGODB_URI_TEST to override): ${error.message}`,
    );
  }
  await mongoose.connection.dropDatabase();
  await Promise.all([Event.init(), Device.init(), Rule.init(), Setting.init()]);
  await initializeStores();
}

export async function resetTestData() {
  await Promise.all([Event.deleteMany({}), Device.deleteMany({}), Rule.deleteMany({}), Setting.deleteMany({})]);
  resetRuleCache();
  resetSettingsCache();
  resetDetectionState();
  resetApiRateLimitRecords();
  await initializeStores();
}

export async function disconnectTestDatabase() {
  await mongoose.disconnect();
}

/** Minimal valid device report; override fields per test. */
export function report(overrides = {}) {
  return {
    deviceId: 'esp-test-01',
    clientIp: '192.168.1.50',
    method: 'GET',
    path: '/',
    responseStatus: 200,
    userAgent: 'Mozilla/5.0 test',
    ...overrides,
  };
}
