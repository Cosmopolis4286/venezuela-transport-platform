import {
  EMPTY_OUTBOX,
  newClientId,
  requestOf,
  tripWithPending,
  withFailed,
  withItem,
  withoutFailed,
  withSent,
  type OutboxItem,
} from './outbox';

const depart: OutboxItem = {
  id: 'depart-t1',
  kind: 'depart',
  tripId: 't1',
  at: '2026-11-23T10:00:00.000Z',
  label: 'Salida · Tucupita - El Triunfo',
};
const arrive: OutboxItem = {
  ...depart,
  id: 'arrive-t1',
  kind: 'arrive',
  at: '2026-11-23T12:00:00.000Z',
};
const cash: OutboxItem = {
  id: 'c1',
  kind: 'cash',
  organizationId: 'o1',
  body: {
    routeId: 'r1',
    fromStopId: 's1',
    toStopId: 's2',
    passengers: 2,
    clientId: 'c1',
    soldAt: '2026-11-23T10:05:00.000Z',
  },
  label: '2 × El Triunfo → Sierra',
};

describe('outbox', () => {
  it('keeps work in order and builds its requests', () => {
    const outbox = withItem(withItem(EMPTY_OUTBOX, 'u1', depart), 'u1', cash);
    expect(outbox.pending.map((i) => i.id)).toEqual(['depart-t1', 'c1']);
    expect(requestOf(depart)).toEqual({
      path: '/me/driving/t1/depart',
      body: { at: depart.at },
    });
    expect(requestOf(cash)).toEqual({ path: '/organizations/o1/cash-sales', body: cash.body });
  });

  it("never mixes another account's pending work", () => {
    const mine = withItem(EMPTY_OUTBOX, 'u1', depart);
    expect(withItem(mine, 'u2', cash)).toBe(mine);
    // Once sent, the queue can belong to whoever drives now.
    expect(withItem(withSent(mine, depart.id), 'u2', cash).userId).toBe('u2');
  });

  it('moves refused work out of the queue with its reason', () => {
    const outbox = withFailed(
      withItem(EMPTY_OUTBOX, 'u1', cash),
      'c1',
      'La ruta no está publicada',
    );
    expect(outbox.pending).toEqual([]);
    expect(outbox.failed).toEqual([{ item: cash, message: 'La ruta no está publicada' }]);
    expect(withoutFailed(outbox).failed).toEqual([]);
  });

  it('shows a trip departed or arrived while it is not sent', () => {
    const trip = { id: 't1', departedAt: null, arrivedAt: null };
    expect(tripWithPending(trip, [])).toEqual({ ...trip, pendingStep: false });
    expect(tripWithPending(trip, [depart, arrive])).toEqual({
      id: 't1',
      departedAt: depart.at,
      arrivedAt: arrive.at,
      pendingStep: true,
    });
    // What the API already knows wins.
    const known = { id: 't1', departedAt: '2026-11-23T09:58:00.000Z', arrivedAt: null };
    expect(tripWithPending(known, [depart]).departedAt).toBe(known.departedAt);
  });

  it('makes UUIDs', () => {
    expect(newClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(newClientId()).not.toBe(newClientId());
  });
});
