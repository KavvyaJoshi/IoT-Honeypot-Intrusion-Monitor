import { describe, expect, it } from 'vitest';
import { ingestEventSchema, listEventsQuerySchema } from '../../src/validation/schemas.js';

const valid = { deviceId: 'esp-lab-01', clientIp: '192.168.1.20', method: 'get', path: '/status' };

describe('ingestEventSchema', () => {
  it('accepts a minimal report and upper-cases the method', () => {
    const parsed = ingestEventSchema.parse(valid);
    expect(parsed.method).toBe('GET');
  });

  it('strips client-supplied verdict fields and secrets', () => {
    const parsed = ingestEventSchema.parse({
      ...valid,
      severity: 'info',
      classification: 'normal',
      actionTaken: 'allowed',
      simulated: true,
      sourceType: 'simulator',
      password: 'hunter2',
    });
    for (const key of ['severity', 'classification', 'actionTaken', 'simulated', 'sourceType', 'password']) {
      expect(parsed).not.toHaveProperty(key);
    }
  });

  it.each([
    ['missing deviceId', { ...valid, deviceId: undefined }],
    ['bad deviceId characters', { ...valid, deviceId: 'esp lab/01' }],
    ['invalid IP', { ...valid, clientIp: '999.1.1.1' }],
    ['method with spaces', { ...valid, method: 'GET /' }],
    ['empty path', { ...valid, path: '' }],
    ['path over 2048 chars', { ...valid, path: `/${'a'.repeat(2048)}` }],
    ['status out of range', { ...valid, responseStatus: 700 }],
    ['non-integer status', { ...valid, responseStatus: 200.5 }],
    ['unknown loginResult', { ...valid, loginResult: 'maybe' }],
    ['too many headers', { ...valid, headers: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`h${i}`, 'v'])) }],
    ['short correlationId', { ...valid, correlationId: 'abc' }],
  ])('rejects %s', (_label, input) => {
    expect(ingestEventSchema.safeParse(input).success).toBe(false);
  });
});

describe('listEventsQuerySchema', () => {
  it('applies defaults and parses comma-separated filters', () => {
    const parsed = listEventsQuerySchema.parse({ severity: 'high,critical', page: '2' });
    expect(parsed).toMatchObject({ page: 2, limit: 25, severity: ['high', 'critical'], sort: 'timestamp', order: 'desc' });
  });

  it('rejects unknown sort fields and filter values', () => {
    expect(listEventsQuerySchema.safeParse({ sort: '$where' }).success).toBe(false);
    expect(listEventsQuerySchema.safeParse({ severity: 'extreme' }).success).toBe(false);
    expect(listEventsQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});
