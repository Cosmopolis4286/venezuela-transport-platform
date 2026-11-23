import { ApiError, useAuth, userMessage } from '@vtp/mobile-core';
import {
  networkClock,
  normalizePin,
  ticketIdFromQr,
  type OfflineTicket,
  type TicketValidation,
  type ValidateTicketRequest,
} from '@vtp/shared-types';
import { useState } from 'react';
import { noSignal, withTimeout } from './no-signal';
import { updateOffline, useOfflineSync, useOfflineTickets } from './offline-store';
import {
  checkOffline,
  withBoarding,
  withOnlineBoarding,
  type OfflineTickets,
} from './offline-tickets';
import { ticketErrorMessage } from './ticket-result';

/** The ticket on the saved list that an online answer was about, to not accept it again here. */
function savedTicketOf(
  saved: OfflineTickets,
  body: ValidateTicketRequest,
  validation: TicketValidation,
): OfflineTicket | undefined {
  if ('qr' in body) {
    const id = ticketIdFromQr(body.qr);
    return saved.list?.tickets.find((t) => t.ticketId === id);
  }
  if ('pin' in body) {
    const pin = normalizePin(body.pin);
    return saved.list?.tickets.find((t) => t.tripId === body.tripId && t.pin === pin);
  }
  return saved.list?.tickets.find(
    (t) => t.bookingCode === validation.bookingCode && t.seatNumber === validation.seatNumber,
  );
}

/**
 * Checks tickets of a line (QR, code and seat, or PIN): online first, and with the list saved on
 * the phone when there is no signal or no answer in 8 seconds (ADR-049, ADR-052).
 */
export function useTicketCheck(organizationId: string) {
  const { api } = useAuth();
  const [result, setResult] = useState<TicketValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const saved = useOfflineTickets(organizationId);
  useOfflineSync(api, organizationId);
  const listAt = saved.list ? networkClock(saved.list.generatedAt) : null;

  /** Without signal: the list on the phone, and the boarding is sent when the signal is back. */
  const validateOffline = (body: ValidateTicketRequest) => {
    const checked = checkOffline(saved, body, Date.now());
    if (!checked) {
      setResult(null);
      setError(
        saved.list
          ? `Sin señal, y este boleto no está en la lista guardada (de las ${listAt}). Si lo compró hace poco, pide que espere a que vuelva la señal o cóbrale en efectivo.`
          : 'Sin señal, y todavía no hay boletos guardados en este teléfono. Abre la app con señal antes de salir.',
      );
      return;
    }
    if (checked.boarding) {
      const boarding = checked.boarding;
      updateOffline(organizationId, (kept) => withBoarding(kept, boarding));
    }
    setOffline(true);
    setResult(checked.validation);
  };

  const validate = async (body: ValidateTicketRequest) => {
    setBusy(true);
    setError(null);
    setOffline(false);
    try {
      const validation = await withTimeout(
        api.request<TicketValidation>(`/organizations/${organizationId}/tickets/validate`, {
          method: 'POST',
          body,
        }),
      );
      // Not accepted again on this phone if the signal goes.
      const ticketId = savedTicketOf(saved, body, validation)?.ticketId;
      if (validation.result === 'boarded' && ticketId) {
        updateOffline(organizationId, (kept) =>
          withOnlineBoarding(kept, ticketId, validation.boardedAt ?? new Date().toISOString()),
        );
      }
      setResult(validation);
    } catch (e) {
      if (noSignal(e)) {
        validateOffline(body);
      } else {
        setResult(null);
        setError(
          e instanceof ApiError ? ticketErrorMessage(e.status, userMessage(e)) : userMessage(e),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setOffline(false);
  };

  return { validate, reset, result, error, busy, offline, saved, listAt };
}
