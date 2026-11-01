import { describe, expect, it } from 'vitest';
import {
  SEAT_LAYOUT_PRESETS,
  layoutProblem,
  normalizePlate,
  plateProblem,
  presetLayout,
  renumberSeats,
  vehicleDocumentStatus,
  vehicleName,
  worstDocumentStatus,
} from './fleet.js';
import { roleHasPermission } from './organizations.js';

describe('seat layouts', () => {
  it('builds valid presets with the advertised capacity', () => {
    const capacity = Object.fromEntries(
      SEAT_LAYOUT_PRESETS.map((preset) => {
        const layout = presetLayout(preset);
        expect(layoutProblem(layout)).toBeNull();
        return [preset, layout.seats.length];
      }),
    );
    expect(capacity).toEqual({ coach_2_2: 44, sleeper_2_1: 30, double_decker: 60, car_4: 4 });
    // The coach leaves column 2 as the aisle.
    expect(presetLayout('coach_2_2').seats.some((s) => s.column === 2)).toBe(false);
  });

  it('explains invalid layouts in Spanish', () => {
    const base = { decks: 1, rows: 2, columns: 3 };
    const seat = (number: string, row: number, column: number, deck = 0) => ({
      number,
      deck,
      row,
      column,
    });
    expect(layoutProblem({ ...base, seats: [] })).toMatch(/al menos un puesto/);
    expect(layoutProblem({ ...base, seats: [seat('1', 2, 0)] })).toMatch(/fuera del plano/);
    expect(layoutProblem({ ...base, seats: [seat('1', 0, 0, 1)] })).toMatch(/fuera del plano/);
    expect(layoutProblem({ ...base, seats: [seat('1', 0, 0), seat('2', 0, 0)] })).toMatch(
      /misma casilla/,
    );
    expect(layoutProblem({ ...base, seats: [seat('A1', 0, 0), seat('a1', 0, 1)] })).toMatch(
      /repetido/,
    );
    expect(layoutProblem({ ...base, seats: [seat('12345', 0, 0)] })).toMatch(/1 a 4/);
    expect(layoutProblem({ ...base, columns: 7, seats: [seat('1', 0, 0)] })).toMatch(/columnas/);
  });

  it('renumbers by deck, row and column', () => {
    const seats = renumberSeats([
      { number: 'x', deck: 1, row: 0, column: 0 },
      { number: 'y', deck: 0, row: 1, column: 0 },
      { number: 'z', deck: 0, row: 0, column: 3 },
    ]);
    expect(seats.map((s) => `${s.number}@${s.deck}${s.row}${s.column}`)).toEqual([
      '1@003',
      '2@010',
      '3@100',
    ]);
  });

  it('lets owners and admins manage the fleet', () => {
    expect(roleHasPermission('admin', 'fleet.manage')).toBe(true);
    expect(roleHasPermission('dispatcher', 'fleet.manage')).toBe(false);
  });
});

describe('vehicle plates', () => {
  it('normalizes and validates Venezuelan plates', () => {
    expect(normalizePlate(' ab-123.cd ')).toBe('AB123CD');
    expect(plateProblem('AB123CD')).toBeNull();
    expect(plateProblem('a1b 2c')).toBeNull();
    expect(plateProblem('AB1')).toMatch(/placa/);
    expect(plateProblem('AB123CD45')).toMatch(/placa/);
    expect(plateProblem('AB_123')).toMatch(/placa/);
    expect(vehicleName({ plate: 'AB123CD', label: 'Unidad 12' })).toBe('AB123CD · Unidad 12');
    expect(vehicleName({ plate: 'AB123CD', label: null })).toBe('AB123CD');
  });
});

describe('vehicle documents', () => {
  it('is valid, expiring within 30 days, or expired after its last day', () => {
    expect(vehicleDocumentStatus('2026-12-31', '2026-11-01')).toBe('valid');
    expect(vehicleDocumentStatus('2026-12-01', '2026-11-01')).toBe('expiring');
    expect(vehicleDocumentStatus('2026-11-01', '2026-11-01')).toBe('expiring');
    expect(vehicleDocumentStatus('2026-10-31', '2026-11-01')).toBe('expired');
  });

  it('reports the worst status, or null when all are fine', () => {
    expect(worstDocumentStatus([])).toBeNull();
    expect(worstDocumentStatus(['valid', 'valid'])).toBeNull();
    expect(worstDocumentStatus(['valid', 'expiring'])).toBe('expiring');
    expect(worstDocumentStatus(['expiring', 'expired'])).toBe('expired');
  });
});
