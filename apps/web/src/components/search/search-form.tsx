import { INTL_LOCALES, localeSegment, todayInVenezuela, type Stop } from '@vtp/shared-types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { getMessages } from '@/i18n/locale';
import { getStops } from '@/lib/server/network';

function StopOptions({ stops, collator }: { stops: Stop[]; collator: string }) {
  const states = [...new Set(stops.map((s) => s.state))].sort((a, b) =>
    a.localeCompare(b, collator),
  );
  return states.map((state) => (
    <optgroup key={state} label={state}>
      {stops
        .filter((s) => s.state === state)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.city} · {s.name}
          </option>
        ))}
    </optgroup>
  ));
}

/** Plain GET form to /[lang]/buscar: works without JavaScript and gives shareable result URLs. */
export async function SearchForm({
  from = '',
  to = '',
  date,
}: {
  from?: string;
  to?: string;
  date?: string;
}) {
  const [stops, { locale, t }] = await Promise.all([getStops(), getMessages()]);
  const today = todayInVenezuela();
  const collator = INTL_LOCALES[locale];
  return (
    <form
      action={`/${localeSegment(locale)}/buscar`}
      role="search"
      className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
    >
      <Field label={t.form.origin} htmlFor="from">
        <Select id="from" name="from" required defaultValue={from}>
          <option value="">{t.form.fromPlaceholder}</option>
          <StopOptions stops={stops} collator={collator} />
        </Select>
      </Field>
      <Field label={t.form.destination} htmlFor="to">
        <Select id="to" name="to" required defaultValue={to}>
          <option value="">{t.form.toPlaceholder}</option>
          <StopOptions stops={stops} collator={collator} />
        </Select>
      </Field>
      <Field label={t.form.date} htmlFor="date">
        <Input
          id="date"
          name="date"
          type="date"
          required
          min={today}
          defaultValue={date ?? today}
        />
      </Field>
      <Button type="submit">{t.form.submit}</Button>
    </form>
  );
}
