import { upcomingDays } from './dates';

describe('upcomingDays', () => {
  it('labels today, tomorrow and then weekday + day of month', () => {
    const days = upcomingDays(4, '2026-10-30');
    expect(days.map((d) => d.value)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(days[0]!.label).toBe('Hoy');
    expect(days[1]!.label).toBe('Mañana');
    expect(days[2]!.label).toMatch(/^dom 1$/);
    expect(days[3]!.label).toMatch(/^lun 2$/);
  });
});
