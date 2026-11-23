import { describe, expect, it } from 'vitest';
import { OFFLINE_MAX_AGE_MS, offlineTime } from './offline.js';

describe('offlineTime', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');

  it('keeps a past time within 48 hours', () => {
    expect(offlineTime('2026-11-23T10:00:00Z', now)).toBe(Date.parse('2026-11-23T10:00:00Z'));
  });

  it('never accepts the future, very old times or garbage', () => {
    expect(offlineTime('2026-11-24T10:00:00Z', now)).toBe(now);
    expect(offlineTime('2026-11-01T10:00:00Z', now)).toBe(now - OFFLINE_MAX_AGE_MS);
    expect(offlineTime('ayer', now)).toBe(now);
    expect(offlineTime(undefined, now)).toBe(now);
  });
});
