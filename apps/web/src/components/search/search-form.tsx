import { todayInVenezuela, type Stop } from '@vtp/shared-types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { getStops } from '@/lib/server/network';

function StopOptions({ stops }: { stops: Stop[] }) {
  const states = [...new Set(stops.map((s) => s.state))].sort((a, b) => a.localeCompare(b, 'es'));
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

/** Plain GET form to /buscar: works without JavaScript and gives shareable result URLs. */
export async function SearchForm({
  from = '',
  to = '',
  date,
}: {
  from?: string;
  to?: string;
  date?: string;
}) {
  const stops = await getStops();
  const today = todayInVenezuela();
  return (
    <form
      action="/buscar"
      role="search"
      className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
    >
      <Field label="Origen" htmlFor="from">
        <Select id="from" name="from" required defaultValue={from}>
          <option value="">¿Desde dónde sales?</option>
          <StopOptions stops={stops} />
        </Select>
      </Field>
      <Field label="Destino" htmlFor="to">
        <Select id="to" name="to" required defaultValue={to}>
          <option value="">¿A dónde vas?</option>
          <StopOptions stops={stops} />
        </Select>
      </Field>
      <Field label="Fecha" htmlFor="date">
        <Input
          id="date"
          name="date"
          type="date"
          required
          min={today}
          defaultValue={date ?? today}
        />
      </Field>
      <Button type="submit">Buscar viajes</Button>
    </form>
  );
}
