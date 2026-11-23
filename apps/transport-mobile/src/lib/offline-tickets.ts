import {
  inBoardingWindow,
  normalizeBookingCode,
  normalizePin,
  ticketIdFromQr,
  type OfflineBoarding,
  type OfflineBoardingOutcome,
  type OfflineTicket,
  type OfflineTicketList,
  type TicketValidation,
  type ValidateTicketRequest,
} from '@vtp/shared-types';

/**
 * What the driver's phone keeps per line to check tickets without signal (ADR-049): the last list
 * downloaded, the boardings it accepted that the API has not received yet, and every ticket
 * boarded on this phone since that list (so it is not accepted twice here).
 */
export interface OfflineTickets {
  list: OfflineTicketList | null;
  pending: OfflineBoarding[];
  boardedHere: Record<string, string>;
}

export const EMPTY_OFFLINE: OfflineTickets = { list: null, pending: [], boardedHere: {} };

/** A list older than this may miss tickets sold since: the screen warns about it. */
export const OFFLINE_LIST_STALE_MS = 3 * 3600_000;

function find(list: OfflineTicketList, input: ValidateTicketRequest): OfflineTicket | undefined {
  if ('qr' in input && typeof input.qr === 'string') {
    const id = ticketIdFromQr(input.qr);
    return id ? list.tickets.find((t) => t.ticketId === id) : undefined;
  }
  if ('pin' in input && typeof input.pin === 'string') {
    const pin = normalizePin(input.pin);
    return pin ? list.tickets.find((t) => t.tripId === input.tripId && t.pin === pin) : undefined;
  }
  const typed = input as { bookingCode: string; seatNumber: string };
  const code = normalizeBookingCode(typed.bookingCode);
  const seat = typed.seatNumber.trim().toUpperCase();
  return list.tickets.find((t) => t.bookingCode === code && t.seatNumber === seat);
}

/**
 * Checks a ticket against the saved list with the same rules as the API. `boarding` is what to
 * keep and send later when the passenger may board; null otherwise. A ticket that is not on the
 * list gives `null`: it may have been sold after the list was made, so the driver is told so.
 */
export function checkOffline(
  saved: OfflineTickets,
  input: ValidateTicketRequest,
  now: number,
): { validation: TicketValidation; boarding: OfflineBoarding | null } | null {
  const ticket = saved.list ? find(saved.list, input) : undefined;
  if (!ticket) return null;
  const boardedAt = saved.boardedHere[ticket.ticketId] ?? ticket.boardedAt;
  const inWindow = inBoardingWindow(
    { departsAt: Date.parse(ticket.departsAt), arrivesAt: Date.parse(ticket.arrivesAt) },
    ticket.open,
    now,
  );
  const result: TicketValidation['result'] = boardedAt
    ? 'already_boarded'
    : inWindow
      ? 'boarded'
      : 'other_departure';
  const boarding =
    result === 'boarded'
      ? { ticketId: ticket.ticketId, boardedAt: new Date(now).toISOString() }
      : null;
  return {
    boarding,
    validation: {
      result,
      boardedAt: boarding?.boardedAt ?? boardedAt,
      bookingCode: ticket.bookingCode,
      bookingStatus: 'confirmed',
      seatNumber: ticket.seatNumber,
      passengerName: ticket.passengerName,
      documentNumber: ticket.documentHint,
      route: ticket.route,
      serviceDate: ticket.serviceDate,
      departsAt: ticket.departsAt,
      from: ticket.from,
      to: ticket.to,
    },
  };
}

/** Keeps a boarding made without signal, to send later. */
export function withBoarding(saved: OfflineTickets, boarding: OfflineBoarding): OfflineTickets {
  return {
    ...saved,
    pending: [...saved.pending, boarding],
    boardedHere: { ...saved.boardedHere, [boarding.ticketId]: boarding.boardedAt },
  };
}

/** A ticket validated online on this phone: not to be accepted again without signal. */
export function withOnlineBoarding(
  saved: OfflineTickets,
  ticketId: string,
  boardedAt: string,
): OfflineTickets {
  return { ...saved, boardedHere: { ...saved.boardedHere, [ticketId]: boardedAt } };
}

/** After sending: drops what the API answered (any answer: it is recorded there). */
export function withoutSent(
  saved: OfflineTickets,
  outcomes: OfflineBoardingOutcome[],
): OfflineTickets {
  const sent = new Set(outcomes.map((o) => o.ticketId));
  return { ...saved, pending: saved.pending.filter((b) => !sent.has(b.ticketId)) };
}

/**
 * A fresh list replaces the old one. Boardings still pending stay marked here, since the new
 * list does not know them yet.
 */
export function withList(saved: OfflineTickets, list: OfflineTicketList): OfflineTickets {
  const boardedHere = Object.fromEntries(
    saved.pending.map((b) => [b.ticketId, b.boardedAt] as const),
  );
  return { ...saved, list, boardedHere };
}
