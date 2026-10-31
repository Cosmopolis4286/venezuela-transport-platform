import { longDate, networkClock, toNetworkIso, type Locale } from '@vtp/shared-types';

/** "martes, 3 de noviembre, 21:00" in Venezuelan time, in the recipient's language. */
export function departureText(departsAt: Date, locale: Locale): string {
  return `${longDate(toNetworkIso(departsAt), locale)}, ${networkClock(departsAt)}`;
}
