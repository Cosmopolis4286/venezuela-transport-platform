import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Creates, through the real API, what the browser tests need: an approved bus company with a
 * route, fares and daily departures, a passenger with a paid booking for tomorrow, and a taxi
 * line serving the origin terminal (taxis asked for by WhatsApp). The
 * reviewer role is granted with the same CLI an operator uses (`pnpm platform:grant`).
 */
const API = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';
const here = dirname(fileURLToPath(import.meta.url));
export const SEED_FILE = join(here, '..', '..', 'test-results', 'seed.json');

export interface Seed {
  password: string;
  ownerEmail: string;
  reviewerEmail: string;
  organizationId: string;
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  serviceDate: string;
  passengerLastName: string;
}

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

interface Auth {
  user: { id: string; email: string };
  tokens: { accessToken: string };
}

export default async function seed(): Promise<void> {
  const run = randomUUID().slice(0, 8);
  const password = 'una frase larga de prueba';
  const register = (name: string) =>
    call<Auth>('POST', '/auth/register', undefined, {
      email: `pw-${name}-${run}@example.test`,
      password,
      firstName: name,
      lastName: `Prueba ${run}`,
      client: 'web',
      acceptTerms: true,
    });
  const reviewer = await register('revisora');
  const owner = await register('duena');
  const passenger = await register('pasajera');
  execFileSync(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      'dist/cli/platform-grant.js',
      '--email',
      reviewer.user.email,
      '--role',
      'reviewer',
    ],
    { cwd: join(here, '..', '..', '..', 'api'), stdio: 'pipe' },
  );

  const rt = reviewer.tokens.accessToken;
  const ot = owner.tokens.accessToken;
  const stop = (city: string) =>
    call<{ id: string; name: string }>('POST', '/admin/stops', rt, {
      kind: 'terminal',
      name: `Terminal ${city} ${run}`,
      city,
      state: 'Estado',
    });
  const origin = await stop('Caracas');
  const destination = await stop('Valencia');
  const { organization } = await call<{ organization: { id: string } }>(
    'POST',
    '/organizations',
    ot,
    {
      type: 'bus_company',
      legalName: `Expresos Prueba ${run}`,
      rif: `J-${Math.floor(10_000_000 + Math.random() * 80_000_000)}-1`,
    },
  );
  await call('POST', `/admin/organizations/${organization.id}/review`, rt, {
    decision: 'approve',
  });
  const org = `/organizations/${organization.id}`;
  const layout = await call<{ id: string }>('POST', `${org}/seat-layouts`, ot, {
    name: 'Bus 2-1',
    decks: 1,
    rows: 4,
    columns: 4,
    seats: Array.from({ length: 12 }, (_, i) => ({
      number: String(i + 1),
      deck: 0,
      row: Math.floor(i / 3),
      column: [0, 2, 3][i % 3],
    })),
  });
  const route = await call<{ id: string }>('POST', `${org}/routes`, ot, {
    name: `Caracas – Valencia ${run}`,
    stops: [
      { stopId: origin.id, minutesFromOrigin: 0 },
      { stopId: destination.id, minutesFromOrigin: 180 },
    ],
  });
  await call('PUT', `${org}/routes/${route.id}/fares`, ot, {
    fares: [{ fromStopId: origin.id, toStopId: destination.id, amount: '15', currency: 'USD' }],
  });
  // Venezuela is UTC-4 all year.
  const today = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
  const serviceDate = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
  const { schedules } = await call<{ schedules: { id: string }[] }>(
    'POST',
    `${org}/routes/${route.id}/schedules`,
    ot,
    {
      departureTime: '09:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      validFrom: today,
      serviceClass: 'executive',
      seatLayoutId: layout.id,
    },
  );
  await call('POST', `${org}/routes/${route.id}/status`, ot, { status: 'active' });

  // A taxi line at the origin terminal, for taxis asked for by WhatsApp (ADR-037).
  const taxiOwner = await register('taxista');
  const line = await call<{ organization: { id: string } }>(
    'POST',
    '/organizations',
    taxiOwner.tokens.accessToken,
    {
      type: 'taxi_line',
      legalName: `Mototaxis Prueba ${run}`,
      rif: `J-${Math.floor(10_000_000 + Math.random() * 80_000_000)}-2`,
    },
  );
  await call('POST', `/admin/organizations/${line.organization.id}/review`, rt, {
    decision: 'approve',
  });
  await call(
    'PUT',
    `/organizations/${line.organization.id}/taxi/terminals`,
    taxiOwner.tokens.accessToken,
    { stopIds: [origin.id] },
  );

  // The passenger books and pays (simulated provider: development and CI only).
  const pt = passenger.tokens.accessToken;
  const booking = await call<{ id: string }>('POST', '/bookings', pt, {
    scheduleId: schedules[0]!.id,
    serviceDate,
    fromStopId: origin.id,
    toStopId: destination.id,
    passengers: [
      {
        seatNumber: '4',
        firstName: 'Rosa',
        lastName: `Pasajera ${run}`,
        documentType: 'V',
        documentNumber: '18765432',
      },
    ],
  });
  const payment = await call<{ id: string }>('POST', `/me/bookings/${booking.id}/payments`, pt, {
    method: 'usdt',
  });
  await call('POST', `/me/payments/${payment.id}/simulate`, pt, {});

  const data: Seed = {
    password,
    ownerEmail: owner.user.email,
    reviewerEmail: reviewer.user.email,
    organizationId: organization.id,
    originId: origin.id,
    destinationId: destination.id,
    originName: origin.name,
    destinationName: destination.name,
    serviceDate,
    passengerLastName: `Pasajera ${run}`,
  };
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(data));
}
