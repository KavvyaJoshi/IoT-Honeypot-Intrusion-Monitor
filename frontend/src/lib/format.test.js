import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatNumber, formatRelative, humanize } from './format.js';

describe('format helpers', () => {
  it('formats relative times', () => {
    const now = Date.parse('2026-10-22T12:00:00Z');
    expect(formatRelative(null, now)).toBe('Never');
    expect(formatRelative('2026-10-22T11:59:58Z', now)).toBe('just now');
    expect(formatRelative('2026-10-22T11:59:30Z', now)).toBe('30s ago');
    expect(formatRelative('2026-10-22T11:55:00Z', now)).toBe('5m ago');
    expect(formatRelative('2026-10-22T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelative('2026-10-19T12:00:00Z', now)).toBe('3d ago');
  });

  it('formats durations, bytes and numbers', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(3_725_000)).toBe('1h 2m');
    expect(formatDuration(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(31_000)).toBe('30.3 KB');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('humanizes parameter keys', () => {
    expect(humanize('windowSeconds')).toBe('Window Seconds');
    expect(humanize('max-path_length')).toBe('Max path length');
  });
});
