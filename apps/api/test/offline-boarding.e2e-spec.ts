import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  ticketIdFromQr,
  todayInVenezuela,
  type AuthResponse,
  type BoardingIssue,
  type Booking,
  type OfflineBoardingOutcome,
  type OfflineTicketList,
  type Route,
  type Stop,
  type TicketValidation,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookingPassengers } from '../src/modules/bookings/bookings.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { memberships } from '../src/modules/organizations/organizations.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

describe.runIf(expectDatabase)('Boarding without signal (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const register = async (name: string) => {
    const body = (
      await http()
        .post('/api/v1/auth/register')
        .send({
          email: `offline-${name}-${run}@example.test`,
          password: 'una frase larga de prueba',
          firstName: name,
          lastName: 'Prueba',
          client: 'web',
          acceptTerms: true,
        })
        .expect(201)
    ).body as AuthResponse;
    return { ...body, auth: `Bearer ${body.tokens.accessToken}` };
  };

  it(
    "keeps the day's tickets on the driver's phone, takes the boardings later and flags a double use",
    { timeout: 30_000 },
    async () => {
      const db = app.get(DatabaseService).db;
      const admin = await register('admin');
      const owner = await register('linea');
      const jose = await register('Jose');
      const maria = await register('Maria');
      const passenger = await register('pasajera');
      await db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, admin.user.id));

      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({
              kind: 'stop',
              name: `${name} ${run}`,
              city: 'Casacoima',
              state: 'Delta Amacuro',
            })
            .expect(201)
        ).body as Stop;
      const triunfo = await stop('El Triunfo');
      const sanFelix = await stop('San Félix');
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Línea El Triunfo ${run}`,
            rif: `J-${randomInt(10_000_000, 99_999_999)}-1`,
          })
          .expect(201)
      ).body as { organization: { id: string } };
      await http()
        .post(`/api/v1/admin/organizations/${organization.id}/review`)
        .set('Authorization', admin.auth)
        .send({ decision: 'approve' })
        .expect(200);
      const org = `/api/v1/organizations/${organization.id}`;
      for (const driver of [jose, maria]) {
        await db
          .insert(memberships)
          .values({ organizationId: organization.id, userId: driver.user.id, role: 'driver' });
      }
      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({
            name: `El Triunfo – San Félix ${run}`,
            scope: 'suburban',
            stops: [
              { stopId: triunfo.id, minutesFromOrigin: 0 },
              { stopId: sanFelix.id, minutesFromOrigin: 45 },
            ],
          })
          .expect(201)
      ).body as Route;
      await http()
        .put(`${org}/routes/${route.id}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [
            { fromStopId: triunfo.id, toStopId: sanFelix.id, amount: '1.00', currency: 'USD' },
          ],
        })
        .expect(200);
      const today = todayInVenezuela();
      const created = (
        await http()
          .post(`${org}/routes/${route.id}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '00:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: today,
            serviceClass: 'standard',
            seats: 4,
            headwayMinutes: 30,
            lastDepartureTime: '23:59',
          })
          .expect(201)
      ).body as Route;
      await http()
        .post(`${org}/routes/${route.id}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);
      const book = (names: string[]) =>
        http()
          .post('/api/v1/bookings')
          .set('Authorization', passenger.auth)
          .send({
            scheduleId: created.schedules[0]!.id,
            serviceDate: today,
            fromStopId: triunfo.id,
            toStopId: sanFelix.id,
            passengers: names.map((firstName) => ({
              firstName,
              lastName: 'Prueba',
              documentType: 'V',
              documentNumber: '18765432',
            })),
          })
          .expect(201)
          .then((res) => res.body as Booking);
      const booking = await book(['Ana', 'Luis']);
      const payment = (
        await http()
          .post(`/api/v1/me/bookings/${booking.id}/payments`)
          .set('Authorization', passenger.auth)
          .send({ method: 'usdt' })
          .expect(201)
      ).body as { id: string };
      const paid = (
        await http()
          .post(`/api/v1/me/payments/${payment.id}/simulate`)
          .set('Authorization', passenger.auth)
          .send({})
          .expect(200)
      ).body as Booking;
      const [ana, luis] = paid.passengers.map((p) => ticketIdFromQr(p.ticket!.qr)!);
      // Booked but never paid: it is not on the phone.
      const unpaid = await book(['Pedro']);
      const [pedro] = await db
        .select({ id: bookingPassengers.id })
        .from(bookingPassengers)
        .where(eq(bookingPassengers.bookingId, unpaid.id));

      // --- The phone downloads the line's tickets while it has signal.
      await http().get(`${org}/tickets/offline`).set('Authorization', passenger.auth).expect(404);
      const list = (
        await http().get(`${org}/tickets/offline`).set('Authorization', maria.auth).expect(200)
      ).body as OfflineTicketList;
      const mine = list.tickets.filter((t) => t.route.id === route.id);
      expect(mine.map((t) => t.ticketId).sort()).toEqual([ana, luis].sort());
      expect(mine[0]).toMatchObject({
        open: true,
        bookingCode: paid.code,
        documentHint: 'V-•••5432',
        boardedAt: null,
        from: expect.objectContaining({ id: triunfo.id }),
      });
      expect(JSON.stringify(mine)).not.toContain('18765432');

      // --- José boards Ana with signal; María, without signal, also boards Ana and Luis.
      const validated = (
        await http()
          .post(`${org}/tickets/validate`)
          .set('Authorization', jose.auth)
          .send({ qr: paid.passengers[0]!.ticket!.qr })
          .expect(200)
      ).body as TicketValidation;
      expect(validated.result).toBe('boarded');
      const send = (boardings: object[]) =>
        http()
          .post(`${org}/tickets/offline-boardings`)
          .set('Authorization', maria.auth)
          .send({ boardings })
          .expect(200)
          .then((res) => res.body as OfflineBoardingOutcome[]);
      const scannedAt = new Date(Date.now() - 20 * 60_000).toISOString();
      const later = new Date(Date.now() + 3_600_000).toISOString();
      const unknown = '00000000-0000-4000-8000-000000000000';
      const boardings = [
        { ticketId: ana, boardedAt: scannedAt },
        { ticketId: luis, boardedAt: later },
        { ticketId: pedro!.id, boardedAt: scannedAt },
        { ticketId: unknown, boardedAt: scannedAt },
      ];
      expect(await send(boardings)).toEqual([
        { ticketId: ana, result: 'already_boarded' },
        { ticketId: luis, result: 'boarded' },
        { ticketId: pedro!.id, result: 'not_paid' },
        { ticketId: unknown, result: 'not_found' },
      ]);
      // A boarding time in the future is taken as now.
      const [luisRow] = await db
        .select({ boardedAt: bookingPassengers.boardedAt })
        .from(bookingPassengers)
        .where(eq(bookingPassengers.id, luis!));
      expect(luisRow!.boardedAt!.getTime()).toBeLessThanOrEqual(Date.now());
      // Sending the same again (the phone lost the answer) changes nothing.
      expect((await send(boardings)).map((o) => o.result)).toEqual([
        'already_boarded',
        'already_boarded',
        'not_paid',
        'not_found',
      ]);
      await http()
        .post(`${org}/tickets/offline-boardings`)
        .set('Authorization', maria.auth)
        .send({ boardings: [{ ticketId: 'no', boardedAt: scannedAt }] })
        .expect(400);

      // --- The line sees what to review; drivers do not (bookings.view).
      await http()
        .get(`${org}/tickets/boarding-issues`)
        .set('Authorization', maria.auth)
        .expect(403);
      const issues = (
        await http()
          .get(`${org}/tickets/boarding-issues?date=${today}`)
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as BoardingIssue[];
      expect(issues.filter((i) => i.route.id === route.id)).toHaveLength(2);
      expect(issues.find((i) => i.kind === 'double_use')).toMatchObject({
        bookingCode: paid.code,
        passengerName: 'Ana Prueba',
        first: { driverName: 'Jose Prueba' },
        second: { driverName: 'Maria Prueba', boardedAt: scannedAt },
      });
      expect(issues.find((i) => i.kind === 'not_paid')).toMatchObject({
        bookingCode: unpaid.code,
        first: null,
      });
    },
  );
});
