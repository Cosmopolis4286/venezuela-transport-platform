import { NETWORK_UTC_OFFSET } from '@vtp/shared-types';

const MINUTES_PER_DAY = 1440;
/** Longest allowed trip, so a search only has to look a few service days back. */
export const MAX_MINUTES_FROM_ORIGIN = 3 * MINUTES_PER_DAY;

export interface ScheduleWindow {
  /** `HH:MM` or `HH:MM:SS` (Postgres `time`). */
  departureTime: string;
  daysOfWeek: number[];
  validFrom: string;
  validUntil: string | null;
}

export interface Occurrence {
  /** Day the vehicle leaves the route's origin. */
  serviceDate: string;
  /** Local ISO timestamps with the Venezuelan offset. */
  departsAt: string;
  arrivesAt: string;
  durationMinutes: number;
}

/** `YYYY-MM-DD` plus `days`, on the calendar (no time zone involved). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` that exists on the calendar (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Shared with the web and mobile apps. */
export { todayInVenezuela } from '@vtp/shared-types';

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}

/** Local timestamp `minutes` after midnight of `isoDate` (may roll into later days). */
function localTimestamp(isoDate: string, minutes: number): string {
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const rest = minutes - days * MINUTES_PER_DAY;
  const hh = String(Math.floor(rest / 60)).padStart(2, '0');
  const mm = String(rest % 60).padStart(2, '0');
  return `${addDays(isoDate, days)}T${hh}:${mm}:00${NETWORK_UTC_OFFSET}`;
}

function runsOn(schedule: ScheduleWindow, serviceDate: string): boolean {
  return (
    serviceDate >= schedule.validFrom &&
    (schedule.validUntil === null || serviceDate <= schedule.validUntil) &&
    schedule.daysOfWeek.includes(dayOfWeek(serviceDate))
  );
}

/**
 * Departures of `schedule` that leave the stop `fromOffset` minutes after the origin on `date`
 * (local), arriving at the stop `toOffset` minutes after the origin.
 *
 * A bus that leaves Caracas at 22:00 reaches a stop 3 hours down the road the next day, so the
 * service date can be up to three days before the requested date.
 */
export function occurrencesOn(
  date: string,
  schedule: ScheduleWindow,
  fromOffset: number,
  toOffset: number,
): Occurrence[] {
  const start = minutesOfDay(schedule.departureTime);
  const atStop = start + fromOffset;
  const daysLater = Math.floor(atStop / MINUTES_PER_DAY);
  const serviceDate = addDays(date, -daysLater);
  if (!runsOn(schedule, serviceDate)) return [];
  return [
    {
      serviceDate,
      departsAt: localTimestamp(serviceDate, atStop),
      arrivesAt: localTimestamp(serviceDate, start + toOffset),
      durationMinutes: toOffset - fromOffset,
    },
  ];
}

/** The same trip seen from its service date (bookings know the date the vehicle leaves). */
export function occurrenceOnServiceDate(
  serviceDate: string,
  schedule: ScheduleWindow,
  fromOffset: number,
  toOffset: number,
): Occurrence | null {
  if (!runsOn(schedule, serviceDate)) return null;
  const start = minutesOfDay(schedule.departureTime);
  return {
    serviceDate,
    departsAt: localTimestamp(serviceDate, start + fromOffset),
    arrivesAt: localTimestamp(serviceDate, start + toOffset),
    durationMinutes: toOffset - fromOffset,
  };
}
