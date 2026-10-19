'use client';

import type { StopSummary } from '@vtp/shared-types';
import { useId, useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import type { FormState } from '@/lib/form-state';

interface Row {
  key: number;
  stopId: string;
  hours: string;
  minutes: string;
}

let nextKey = 0;
const row = (stopId = '', minutesFromOrigin = 0): Row => ({
  key: nextKey++,
  stopId,
  hours: minutesFromOrigin ? String(Math.floor(minutesFromOrigin / 60)) : '',
  minutes: minutesFromOrigin ? String(minutesFromOrigin % 60) : '',
});

/**
 * Name and ordered stops of a route. Each stop after the origin has its travel time from the
 * origin; the API checks the order, the times and that every stop is active.
 */
export function RouteEditor({
  action,
  hidden,
  stops,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  /** Active stops of the catalog. */
  stops: StopSummary[];
  initial?: { name: string; stops: { stopId: string; minutesFromOrigin: number }[] };
  submitLabel: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial ? initial.stops.map((s) => row(s.stopId, s.minutesFromOrigin)) : [row(), row()],
  );
  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved!);
      return next;
    });
  const states = [...new Set(stops.map((s) => s.state))].sort();
  // Row keys are client-only counters; element ids must match between server and client.
  const uid = useId();

  return (
    <ActionForm action={action} hidden={hidden}>
      <Field label="Nombre de la ruta" htmlFor="route-name">
        <Input
          id="route-name"
          name="name"
          required
          minLength={2}
          defaultValue={initial?.name}
          placeholder="Caracas – Maracaibo"
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Label>Recorrido</Label>
        <p className="text-xs text-muted-foreground">
          Del origen al destino final. Indica cuánto tarda el vehículo en llegar a cada parada desde
          el origen.
        </p>
        <ol className="flex flex-col gap-2">
          {rows.map((r, index) => {
            const origin = index === 0;
            const label = origin
              ? 'Origen'
              : index === rows.length - 1
                ? 'Destino'
                : `Parada ${index}`;
            return (
              <li key={r.key} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                <div className="flex min-w-56 flex-1 flex-col gap-1">
                  <Label htmlFor={`${uid}-stop-${index}`} className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <Select
                    id={`${uid}-stop-${index}`}
                    name="stopId"
                    required
                    value={r.stopId}
                    onChange={(e) => update(r.key, { stopId: e.target.value })}
                  >
                    <option value="">Elige una parada…</option>
                    {states.map((state) => (
                      <optgroup key={state} label={state}>
                        {stops
                          .filter((s) => s.state === state)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.city} · {s.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>
                {origin ? (
                  <>
                    <input type="hidden" name="hours" value="0" />
                    <input type="hidden" name="minutes" value="0" />
                  </>
                ) : (
                  <div className="flex items-end gap-1">
                    <div className="flex w-20 flex-col gap-1">
                      <Label
                        htmlFor={`${uid}-hours-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        Horas
                      </Label>
                      <Input
                        id={`${uid}-hours-${index}`}
                        name="hours"
                        type="number"
                        min={0}
                        max={72}
                        value={r.hours}
                        onChange={(e) => update(r.key, { hours: e.target.value })}
                      />
                    </div>
                    <div className="flex w-20 flex-col gap-1">
                      <Label
                        htmlFor={`${uid}-minutes-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        Minutos
                      </Label>
                      <Input
                        id={`${uid}-minutes-${index}`}
                        name="minutes"
                        type="number"
                        min={0}
                        max={59}
                        value={r.minutes}
                        onChange={(e) => update(r.key, { minutes: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Subir ${label.toLowerCase()}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Bajar ${label.toLowerCase()}`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Quitar ${label.toLowerCase()}`}
                    disabled={rows.length <= 2}
                    onClick={() => setRows((current) => current.filter((x) => x.key !== r.key))}
                  >
                    ✕
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((c) => [...c, row()])}
          >
            Agregar parada
          </Button>
        </div>
      </div>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
