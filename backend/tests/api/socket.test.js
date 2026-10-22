import http from 'node:http';
import { io as connectClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Event } from '../../src/models/Event.js';
import { attachSocketServer, closeSocketServer, SOCKET_EVENTS } from '../../src/sockets/realtime.js';
import { adminHeaders, connectTestDatabase, deviceHeaders, disconnectTestDatabase, report, resetTestData } from '../helpers.js';

let server;
let baseUrl;
let client;

beforeAll(async () => {
  await connectTestDatabase();
  await resetTestData();
  server = http.createServer(createApp());
  attachSocketServer(server, { corsOrigin: ['http://localhost:5173'] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  client = connectClient(baseUrl, { transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });
});

afterAll(async () => {
  client?.close();
  await closeSocketServer();
  await new Promise((resolve) => server.close(resolve));
  await disconnectTestDatabase();
});

function nextMessage(eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${eventName} within ${timeoutMs}ms`)), timeoutMs);
    client.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Socket.IO delivery', () => {
  it('broadcasts device events after they are persisted', async () => {
    await request(baseUrl).post('/api/devices/register').set(deviceHeaders).send({ deviceId: 'esp-test-01' }).expect(201);
    const received = nextMessage(SOCKET_EVENTS.EVENT_NEW);
    const res = await request(baseUrl).post('/api/events/ingest').set(deviceHeaders).send(report({ path: '/.env' })).expect(201);
    const payload = await received;
    expect(payload).toMatchObject({ id: res.body.data.eventId, path: '/.env', category: 'suspicious-path', simulated: false });
    expect(await Event.exists({ _id: payload.id })).toBeTruthy();
  });

  it('broadcasts simulator events marked as simulated', async () => {
    const received = nextMessage(SOCKET_EVENTS.EVENT_NEW);
    await request(baseUrl).post('/api/simulator/events').set(adminHeaders).send({ scenario: 'normal' }).expect(201);
    const payload = await received;
    expect(payload).toMatchObject({ sourceType: 'simulator', simulated: true });
  });

  it('broadcasts device heartbeat updates', async () => {
    const received = nextMessage(SOCKET_EVENTS.DEVICE_UPDATE);
    await request(baseUrl).post('/api/devices/heartbeat').set(deviceHeaders).send({ deviceId: 'esp-test-01', rssi: -55 }).expect(200);
    const payload = await received;
    expect(payload).toMatchObject({ deviceId: 'esp-test-01', status: 'online', lastRssi: -55 });
  });
});
