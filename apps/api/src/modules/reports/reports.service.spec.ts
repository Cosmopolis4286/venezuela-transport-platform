import { reportRange } from './reports.service.js';

describe('reportRange', () => {
  it('covers whole Venezuelan days, both ends included', () => {
    const range = reportRange('2026-10-01', '2026-10-31');
    expect(range.start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('defaults to the last 30 days', () => {
    const range = reportRange(undefined, '2026-10-31');
    expect(range.from).toBe('2026-10-02');
  });

  it('rejects bad dates, reversed ranges and ranges over a year', () => {
    expect(() => reportRange('2026-13-01', '2026-12-01')).toThrow();
    expect(() => reportRange('2026-10-31', '2026-10-01')).toThrow(/after/);
    expect(() => reportRange('2025-01-01', '2026-10-31')).toThrow(/at most/);
    expect(reportRange('2025-11-01', '2026-10-31').from).toBe('2025-11-01');
  });
});
