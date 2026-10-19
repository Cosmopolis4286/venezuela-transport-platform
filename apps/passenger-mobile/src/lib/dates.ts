import { todayInVenezuela } from '@vtp/shared-types';

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The next `count` days as chips: "Hoy", "Mañana", then "jue 22". */
export function upcomingDays(count = 7, today = todayInVenezuela()) {
  const weekday = new Intl.DateTimeFormat('es-VE', { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: count }, (_, index) => {
    const value = addDays(today, index);
    const label =
      index === 0
        ? 'Hoy'
        : index === 1
          ? 'Mañana'
          : `${weekday.format(new Date(`${value}T12:00:00Z`)).replace('.', '')} ${Number(value.slice(8))}`;
    return { value, label };
  });
}
