import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  isCalendarDate,
  occurrencesOn,
  todayInVenezuela,
} from './departures.js';

// 2026-10-19 is a Monday.
const daily = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], validFrom: '2026-01-01', validUntil: null };

describe('occurrencesOn', () => {
  it('returns the departure from the origin with arrival and duration', () => {
    expect(occurrencesOn('2026-10-19', { ...daily, departureTime: '08:30:00' }, 0, 510)).toEqual([
      {
        serviceDate: '2026-10-19',
        departsAt: '2026-10-19T08:30:00-04:00',
        arrivesAt: '2026-10-19T17:00:00-04:00',
        durationMinutes: 510,
      },
    ]);
  });

  it('rolls overnight arrivals into the next day', () => {
    const [trip] = occurrencesOn('2026-10-19', { ...daily, departureTime: '21:00' }, 0, 600);
    expect(trip?.arrivesAt).toBe('2026-10-20T07:00:00-04:00');
  });

  it('finds the previous evening service for an intermediate stop after midnight', () => {
    // Leaves the origin Sunday 22:00, reaches the stop 3 h later: Monday 01:00.
    const sundayOnly = { ...daily, daysOfWeek: [0], departureTime: '22:00' };
    expect(occurrencesOn('2026-10-19', sundayOnly, 180, 420)).toEqual([
      {
        serviceDate: '2026-10-18',
        departsAt: '2026-10-19T01:00:00-04:00',
        arrivesAt: '2026-10-19T05:00:00-04:00',
        durationMinutes: 240,
      },
    ]);
    // On Sunday itself that service is not at the stop yet.
    expect(occurrencesOn('2026-10-18', sundayOnly, 180, 420)).toEqual([]);
  });

  it('respects days of the week and the validity window', () => {
    const weekdays = { ...daily, daysOfWeek: [1, 2, 3, 4, 5], departureTime: '06:00' };
    expect(occurrencesOn('2026-10-18', weekdays, 0, 60)).toEqual([]); // Sunday
    expect(occurrencesOn('2026-10-19', weekdays, 0, 60)).toHaveLength(1);
    const window = { ...weekdays, validFrom: '2026-10-20', validUntil: '2026-10-21' };
    expect(occurrencesOn('2026-10-19', window, 0, 60)).toEqual([]);
    expect(occurrencesOn('2026-10-21', window, 0, 60)).toHaveLength(1);
    expect(occurrencesOn('2026-10-22', window, 0, 60)).toEqual([]);
  });
});

describe('calendar helpers', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayOfWeek('2026-10-19')).toBe(1);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-1-01')).toBe(false);
  });

  it('uses Venezuelan time for today', () => {
    expect(todayInVenezuela(new Date('2026-10-20T03:59:00Z'))).toBe('2026-10-19');
    expect(todayInVenezuela(new Date('2026-10-20T04:00:00Z'))).toBe('2026-10-20');
  });
});
