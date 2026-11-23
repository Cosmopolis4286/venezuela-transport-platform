import type { CreateCashSaleRequest } from '@vtp/shared-types';

/**
 * Work done without signal and sent when it comes back (ADR-051): cash sales, departures and
 * arrivals, in the order they were done. Sending again is safe: a cash sale carries its
 * `clientId` and a trip step already marked answers `TRIP_WRONG_STEP`.
 */
export type OutboxItem =
  | {
      id: string;
      kind: 'cash';
      organizationId: string;
      body: CreateCashSaleRequest & { clientId: string; soldAt: string };
      /** What the driver sees in the list, e.g. "3 × Centro → Turmero, 1,50 US$". */
      label: string;
    }
  | { id: string; kind: 'depart' | 'arrive'; tripId: string; at: string; label: string };

export interface Outbox {
  /** The account it belongs to: only that account sends it. */
  userId: string | null;
  pending: OutboxItem[];
  /** Refused by the API when finally sent, kept so the driver sees why. */
  failed: { item: OutboxItem; message: string }[];
}

export const EMPTY_OUTBOX: Outbox = { userId: null, pending: [], failed: [] };

/** The request that sends an item. */
export function requestOf(item: OutboxItem): { path: string; body: object } {
  if (item.kind === 'cash') {
    return {
      path: `/organizations/${encodeURIComponent(item.organizationId)}/cash-sales`,
      body: item.body,
    };
  }
  return {
    path: `/me/driving/${encodeURIComponent(item.tripId)}/${item.kind}`,
    body: { at: item.at },
  };
}

/** Adds work to send, for `userId` (another account's pending work stays as it was). */
export function withItem(outbox: Outbox, userId: string, item: OutboxItem): Outbox {
  if (outbox.userId !== null && outbox.userId !== userId && outbox.pending.length) return outbox;
  const base = outbox.userId === userId ? outbox : { ...EMPTY_OUTBOX, userId };
  return { ...base, userId, pending: [...base.pending, item] };
}

/** The item was sent, or there is nothing left to do (the step was already marked). */
export function withSent(outbox: Outbox, id: string): Outbox {
  return { ...outbox, pending: outbox.pending.filter((i) => i.id !== id) };
}

/** The API refused the item: it leaves the queue and is shown with the reason. */
export function withFailed(outbox: Outbox, id: string, message: string): Outbox {
  const item = outbox.pending.find((i) => i.id === id);
  if (!item) return outbox;
  return {
    ...outbox,
    pending: outbox.pending.filter((i) => i.id !== id),
    failed: [...outbox.failed, { item, message }],
  };
}

export function withoutFailed(outbox: Outbox): Outbox {
  return { ...outbox, failed: [] };
}

/**
 * How a trip looks with what is still to send: departed or arrived at the time the driver tapped,
 * if the API does not know it yet.
 */
export function tripWithPending<
  T extends { id: string; departedAt: string | null; arrivedAt: string | null },
>(trip: T, pending: OutboxItem[]): T & { pendingStep: boolean } {
  let { departedAt, arrivedAt } = trip;
  for (const item of pending) {
    if (item.kind === 'cash' || item.tripId !== trip.id) continue;
    if (item.kind === 'depart') departedAt ??= item.at;
    else arrivedAt ??= item.at;
  }
  const pendingStep = departedAt !== trip.departedAt || arrivedAt !== trip.arrivedAt;
  return { ...trip, departedAt, arrivedAt, pendingStep };
}

/** A random UUID (v4) for a cash sale: only needs to be unique, not secret. */
export function newClientId(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(random() * 16);
    return (c === 'x' ? n : (n & 0x3) | 0x8).toString(16);
  });
}
