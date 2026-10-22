import { describe, expect, it } from 'vitest';
import { REDACTED, redactHeaders, redactQuery, sanitizeText } from '../../src/utils/redact.js';

describe('redactHeaders', () => {
  it('redacts credential-bearing headers but keeps their presence visible', () => {
    const result = redactHeaders({
      Authorization: 'Basic YWRtaW46cGFzc3dvcmQ=',
      Cookie: 'session=abc123',
      'X-Device-Key': 'super-secret',
      'X-Custom-Token': 'tok',
      'User-Agent': 'curl/8.5.0',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual({
      authorization: REDACTED,
      cookie: REDACTED,
      'x-device-key': REDACTED,
      'x-custom-token': REDACTED,
      'user-agent': 'curl/8.5.0',
      'content-type': 'application/json',
    });
  });

  it('limits header count and value length', () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`h${i}`, 'x'.repeat(1000)]));
    const result = redactHeaders(many);
    expect(Object.keys(result)).toHaveLength(20);
    expect(result.h0.length).toBeLessThanOrEqual(256);
    expect(result.h0.endsWith('…[truncated]')).toBe(true);
  });

  it('returns an empty object for missing headers', () => {
    expect(redactHeaders(undefined)).toEqual({});
  });
});

describe('redactQuery', () => {
  it('redacts sensitive parameter values only', () => {
    expect(redactQuery('user=admin&password=hunter2&token=abc&page=2')).toBe(
      `user=admin&password=${REDACTED}&token=${REDACTED}&page=2`,
    );
  });

  it('handles leading "?", encoded keys and empty input', () => {
    expect(redactQuery('?pass%77ord=x')).toBe(`pass%77ord=${REDACTED}`);
    expect(redactQuery('')).toBeNull();
    expect(redactQuery(undefined)).toBeNull();
  });
});

describe('sanitizeText', () => {
  it('escapes control characters and null bytes', () => {
    expect(sanitizeText('/a\u0000b\nc', 100)).toBe('/a\\x00b\\x0ac');
  });

  it('truncates with a visible marker', () => {
    const value = sanitizeText('a'.repeat(50), 20);
    expect(value).toHaveLength(20);
    expect(value.endsWith('…[truncated]')).toBe(true);
  });
});
