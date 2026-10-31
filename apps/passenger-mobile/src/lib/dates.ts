import { DEFAULT_LOCALE, INTL_LOCALES, todayInVenezuela, type Locale } from '@vtp/shared-types';

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The next `count` days as chips: "Hoy", "Mañana", then "jue 22" (in `locale`). */
export function upcomingDays(
  count = 7,
  today = todayInVenezuela(),
  locale: Locale = DEFAULT_LOCALE,
  words: { today: string; tomorrow: string } = { today: 'Hoy', tomorrow: 'Mañana' },
) {
  const weekday = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    weekday: 'short',
    timeZone: 'UTC',
  });
  return Array.from({ length: count }, (_, index) => {
    const value = addDays(today, index);
    const label =
      index === 0
        ? words.today
        : index === 1
          ? words.tomorrow
          : `${weekday.format(new Date(`${value}T12:00:00Z`)).replace('.', '')} ${Number(value.slice(8))}`;
    return { value, label };
  });
}
