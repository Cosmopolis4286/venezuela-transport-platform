import {
  BOOKING_STATUS_LABELS,
  localTime,
  longDate,
  type TicketValidation,
} from '@vtp/shared-types';

export interface TicketVerdict {
  /** Whether the passenger may board now. */
  ok: boolean;
  tone: 'success' | 'warning' | 'error';
  title: string;
  detail: string | null;
}

/** HH:MM in Venezuela for an instant (UTC−4, no daylight saving). */
function venezuelanTime(iso: string): string {
  return new Date(Date.parse(iso) - 4 * 3600_000).toISOString().slice(11, 16);
}

/** What the inspector reads first after a scan. */
export function ticketVerdict(validation: TicketValidation): TicketVerdict {
  switch (validation.result) {
    case 'boarded':
      return { ok: true, tone: 'success', title: 'Boleto válido: puede abordar', detail: null };
    case 'already_boarded':
      return {
        ok: false,
        tone: 'warning',
        title: 'Este boleto ya se usó',
        detail: validation.boardedAt
          ? `Abordó a las ${venezuelanTime(validation.boardedAt)}. Verifica el documento.`
          : null,
      };
    case 'not_paid':
      return {
        ok: false,
        tone: 'error',
        title: 'Boleto no pagado',
        detail: `Estado de la reserva: ${BOOKING_STATUS_LABELS[validation.bookingStatus].toLowerCase()}.`,
      };
    case 'other_departure':
      return {
        ok: false,
        tone: 'error',
        title: 'Este boleto es para otra salida',
        detail: `Sale el ${longDate(validation.departsAt)} a las ${localTime(validation.departsAt)}.`,
      };
  }
}

/** Spanish message for a failed validation request (404 = not this organization's ticket). */
export function ticketErrorMessage(status: number, fallback: string): string {
  if (status === 404) return 'Boleto no encontrado en esta empresa. Revisa el código y el puesto.';
  if (status === 400) return 'Escribe el código de reserva (6 caracteres) y el número de puesto.';
  return fallback;
}
