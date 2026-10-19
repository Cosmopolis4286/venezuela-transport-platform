'use client';

import {
  SEAT_LAYOUT_LIMITS,
  SEAT_LAYOUT_PRESET_LABELS,
  SEAT_LAYOUT_PRESETS,
  layoutProblem,
  presetLayout,
  renumberSeats,
  type LayoutSeat,
  type SeatLayoutInput,
  type SeatLayoutPreset,
} from '@vtp/shared-types';
import { useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/portal/action-form';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import type { FormState } from '@/lib/form-state';
import { cn } from '@/lib/utils';

const DECK_LABELS = ['Planta baja', 'Planta alta'];

/**
 * Grid editor for a seat map: click a cell to add or remove a seat. Seats are renumbered
 * front to back after every change; the layout is sent to the action as JSON.
 */
export function SeatLayoutEditor({
  action,
  hidden,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  initial?: SeatLayoutInput;
  submitLabel: string;
}) {
  const [layout, setLayout] = useState<SeatLayoutInput>(() => initial ?? presetLayout('coach_2_2'));
  const problem = layoutProblem(layout);

  const resize = (patch: Partial<Pick<SeatLayoutInput, 'decks' | 'rows' | 'columns'>>) =>
    setLayout((current) => {
      const next = { ...current, ...patch };
      // Drop seats that no longer fit.
      const seats = current.seats.filter(
        (s) => s.deck < next.decks && s.row < next.rows && s.column < next.columns,
      );
      return { ...next, seats: renumberSeats(seats) };
    });

  const toggle = (deck: number, row: number, column: number) =>
    setLayout((current) => {
      const exists = current.seats.some(
        (s) => s.deck === deck && s.row === row && s.column === column,
      );
      const seats: LayoutSeat[] = exists
        ? current.seats.filter((s) => !(s.deck === deck && s.row === row && s.column === column))
        : [...current.seats, { number: '', deck, row, column }];
      return { ...current, seats: renumberSeats(seats) };
    });

  return (
    <ActionForm action={action} hidden={{ ...hidden, layout: JSON.stringify(layout) }}>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <Field label="Nombre" htmlFor="layout-name">
          <Input
            id="layout-name"
            value={layout.name}
            onChange={(e) => setLayout((c) => ({ ...c, name: e.target.value }))}
            placeholder="Buscama 2-1"
          />
        </Field>
        <Field label="Pisos" htmlFor="layout-decks">
          <Select
            id="layout-decks"
            value={layout.decks}
            onChange={(e) => resize({ decks: Number(e.target.value) })}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </Select>
        </Field>
        <Field label="Filas" htmlFor="layout-rows">
          <Input
            id="layout-rows"
            type="number"
            min={1}
            max={SEAT_LAYOUT_LIMITS.maxRows}
            value={layout.rows}
            onChange={(e) => resize({ rows: Number(e.target.value) })}
          />
        </Field>
        <Field label="Columnas" htmlFor="layout-columns">
          <Input
            id="layout-columns"
            type="number"
            min={SEAT_LAYOUT_LIMITS.minColumns}
            max={SEAT_LAYOUT_LIMITS.maxColumns}
            value={layout.columns}
            onChange={(e) => resize({ columns: Number(e.target.value) })}
          />
        </Field>
      </div>

      {initial ? null : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Empezar desde:</span>
          {SEAT_LAYOUT_PRESETS.map((preset: SeatLayoutPreset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLayout(presetLayout(preset))}
            >
              {SEAT_LAYOUT_PRESET_LABELS[preset]}
            </Button>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Toca una casilla para poner o quitar un puesto; las casillas vacías son pasillo. El frente
        del vehículo está arriba. {layout.seats.length} puestos.
      </p>

      <div className="flex flex-wrap gap-6">
        {Array.from({ length: layout.decks }, (_, deck) => (
          <SeatGrid key={deck} layout={layout} deck={deck} onToggle={toggle} />
        ))}
      </div>

      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <div>
        <SubmitButton disabled={Boolean(problem) || layout.name.trim().length < 2}>
          {submitLabel}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function SeatGrid({
  layout,
  deck,
  onToggle,
}: {
  layout: SeatLayoutInput;
  deck: number;
  onToggle?: (deck: number, row: number, column: number) => void;
}) {
  const seatAt = (row: number, column: number) =>
    layout.seats.find((s) => s.deck === deck && s.row === row && s.column === column);
  return (
    <figure className="flex flex-col gap-2">
      {layout.decks > 1 ? (
        <figcaption className="text-sm font-medium">{DECK_LABELS[deck]}</figcaption>
      ) : null}
      <div className="rounded-t-3xl border-2 bg-muted/30 p-3 pt-6">
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${layout.columns}, 2.5rem)` }}
        >
          {Array.from({ length: layout.rows }, (_, row) =>
            Array.from({ length: layout.columns }, (_, column) => {
              const seat = seatAt(row, column);
              const label = seat
                ? `Puesto ${seat.number}, fila ${row + 1}, columna ${column + 1}`
                : `Pasillo, fila ${row + 1}, columna ${column + 1}`;
              return onToggle ? (
                <button
                  key={`${row}:${column}`}
                  type="button"
                  aria-label={label}
                  aria-pressed={Boolean(seat)}
                  onClick={() => onToggle(deck, row, column)}
                  className={cn(
                    'h-10 w-10 rounded-md text-xs font-medium transition-colors',
                    seat
                      ? 'border border-primary bg-primary text-primary-foreground'
                      : 'border border-dashed border-muted-foreground/30 text-transparent hover:border-muted-foreground',
                  )}
                >
                  {seat?.number ?? '+'}
                </button>
              ) : (
                <div
                  key={`${row}:${column}`}
                  aria-label={seat ? label : undefined}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-md text-xs font-medium',
                    seat ? 'border bg-background' : '',
                  )}
                >
                  {seat?.number}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </figure>
  );
}

/** Read-only seat map, for members who cannot edit. */
export function SeatLayoutView({ layout }: { layout: SeatLayoutInput }) {
  return (
    <div className="flex flex-wrap gap-6">
      {Array.from({ length: layout.decks }, (_, deck) => (
        <SeatGrid key={deck} layout={layout} deck={deck} />
      ))}
    </div>
  );
}
