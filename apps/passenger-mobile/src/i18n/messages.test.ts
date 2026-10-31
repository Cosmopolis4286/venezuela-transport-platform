import { LOCALES } from '@vtp/shared-types';
import { upcomingDays } from '../lib/dates';
import { MESSAGES } from './messages';

/** Dotted paths of every text; functions count as one text. */
function paths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => paths(v, `${prefix}${k}.`));
  }
  return [prefix];
}

describe('passenger app dictionary', () => {
  it('has the same texts in every language, none empty', () => {
    const spanish = paths(MESSAGES.es).sort();
    for (const locale of LOCALES) {
      expect(paths(MESSAGES[locale]).sort()).toEqual(spanish);
    }
    for (const locale of LOCALES) {
      const m = MESSAGES[locale];
      expect(m.seats(1)).not.toBe(m.seats(2));
      expect(m.taxi.people(3)).toMatch(/^3 /);
      expect(m.seatMap.decks).toHaveLength(2);
    }
  });

  it('writes the day chips in each language', () => {
    const today = '2026-10-29'; // a Thursday
    expect(upcomingDays(3, today).map((d) => d.label)).toEqual(['Hoy', 'Mañana', 'sáb 31']);
    expect(upcomingDays(3, today, 'en', MESSAGES.en.home).map((d) => d.label)).toEqual([
      'Today',
      'Tomorrow',
      'Sat 31',
    ]);
    expect(upcomingDays(3, today, 'pt-BR', MESSAGES['pt-BR'].home).map((d) => d.label)).toEqual([
      'Hoje',
      'Amanhã',
      'sáb 31',
    ]);
  });
});
