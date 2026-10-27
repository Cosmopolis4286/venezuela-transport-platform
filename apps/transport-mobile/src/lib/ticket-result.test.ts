import type { TicketValidation } from '@vtp/shared-types';
import { ticketErrorMessage, ticketVerdict } from './ticket-result';

const base: TicketValidation = {
  result: 'boarded',
  boardedAt: '2026-10-28T01:05:00.000Z',
  bookingCode: 'VTP-7K3QXA',
  bookingStatus: 'confirmed',
  seatNumber: '12',
  passengerName: 'Ana Pérez',
  documentNumber: 'V-12345678',
  route: { id: 'r', name: 'Caracas – Maracaibo' },
  serviceDate: '2026-10-27',
  departsAt: '2026-10-27T21:30:00-04:00',
  from: { id: 'a', kind: 'terminal', name: 'La Bandera', city: 'Caracas', state: 'DC' },
  to: { id: 'b', kind: 'terminal', name: 'Maracaibo', city: 'Maracaibo', state: 'Zulia' },
};

describe('ticketVerdict', () => {
  it('lets on only a first valid scan', () => {
    expect(ticketVerdict(base)).toMatchObject({ ok: true, tone: 'success' });
  });

  it('shows the Venezuelan boarding time of a used ticket', () => {
    expect(ticketVerdict({ ...base, result: 'already_boarded' })).toMatchObject({
      ok: false,
      tone: 'warning',
      detail: 'Abordó a las 21:05. Verifica el documento.',
    });
  });

  it('explains unpaid tickets and tickets for another departure', () => {
    expect(
      ticketVerdict({ ...base, result: 'not_paid', bookingStatus: 'held', boardedAt: null }),
    ).toMatchObject({ ok: false, detail: 'Estado de la reserva: apartada, pendiente de pago.' });
    expect(ticketVerdict({ ...base, result: 'other_departure', boardedAt: null }).detail).toMatch(
      /^Sale el martes, 27 de octubre a las 21:30\.$/,
    );
  });
});

describe('ticketErrorMessage', () => {
  it('maps not found and invalid input to Spanish', () => {
    expect(ticketErrorMessage(404, 'x')).toMatch(/no encontrado/);
    expect(ticketErrorMessage(400, 'x')).toMatch(/código de reserva/);
    expect(ticketErrorMessage(500, 'Error del servidor')).toBe('Error del servidor');
  });
});
