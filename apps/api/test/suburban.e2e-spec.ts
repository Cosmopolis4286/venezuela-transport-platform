import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AuthResponse,
  type Booking,
  type Departure,
  type DriverEarnings,
  type Route,
  type Stop,
  type TicketValidation,
  type TripAvailability,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { bookings } from '../src/modules/bookings/bookings.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { memberships } from '../src/modules/organizations/organizations.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

describe.runIf(expectDatabase)('Suburban frequency service and open tickets (e2e)', () => {
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
          email: `suburban-${name}-${run}@example.test`,
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
    'sells open tickets for the day, numbers them and pays the driver who validates them',
    { timeout: 30_000 },
    async () => {
      const db = app.get(DatabaseService).db;
      const admin = await register('admin');
      const owner = await register('linea');
      const driver = await register('Jose');
      const passenger = await register('pasajera');
      await db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, admin.user.id));

      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({ kind: 'stop', name: `${name} ${run}`, city: 'Maracay', state: 'Aragua' })
            .expect(201)
        ).body as Stop;
      const centro = await stop('Centro');
      const turmero = await stop('Turmero');
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Línea Turmero ${run}`,
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
      await http()
        .put(`/api/v1/admin/organizations/${organization.id}/policy`)
        .set('Authorization', admin.auth)
        .send({ commissionRate: '10', refundTiers: null })
        .expect(200);
      await db
        .insert(memberships)
        .values({ organizationId: organization.id, userId: driver.user.id, role: 'driver' });

      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({
            name: `Maracay – Turmero ${run}`,
            scope: 'suburban',
            stops: [
              { stopId: centro.id, minutesFromOrigin: 0 },
              { stopId: turmero.id, minutesFromOrigin: 35 },
            ],
          })
          .expect(201)
      ).body as Route;
      await http()
        .put(`${org}/routes/${route.id}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [{ fromStopId: centro.id, toStopId: turmero.id, amount: '0.50', currency: 'USD' }],
        })
        .expect(200);
      const today = todayInVenezuela();
      const schedule = {
        departureTime: '00:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        validFrom: today,
        serviceClass: 'standard',
        seats: 2,
      };
      const schedules = `${org}/routes/${route.id}/schedules`;
      const post = (body: object) =>
        http().post(schedules).set('Authorization', owner.auth).send(body);
      // Both fields or neither, a sensible headway, the last unit after the first.
      await post({ ...schedule, headwayMinutes: 30 }).expect(400);
      await post({ ...schedule, headwayMinutes: 2, lastDepartureTime: '23:59' }).expect(400);
      await post({
        ...schedule,
        departureTime: '06:00',
        headwayMinutes: 30,
        lastDepartureTime: '05:00',
      }).expect(400);
      const created = (
        await post({ ...schedule, headwayMinutes: 30, lastDepartureTime: '23:59' }).expect(201)
      ).body as Route;
      const scheduleId = created.schedules[0]!.id;
      expect(created.schedules[0]).toMatchObject({
        headwayMinutes: 30,
        lastDepartureTime: '23:59',
      });
      await http()
        .post(`${org}/routes/${route.id}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);

      // --- Search: one entry for the day, a unit every 30 minutes, 2 seats × 48 units.
      const [departure] = (
        await http()
          .get(`/api/v1/search/departures?from=${centro.id}&to=${turmero.id}&date=${today}`)
          .expect(200)
      ).body as Departure[];
      expect(departure).toMatchObject({
        scheduleId,
        headwayMinutes: 30,
        departsAt: `${today}T00:00:00-04:00`,
        lastDepartsAt: `${today}T23:59:00-04:00`,
        seats: 96,
        seatsAvailable: 96,
      });
      const availability = (
        await http()
          .get(
            `/api/v1/trips/availability?scheduleId=${scheduleId}&serviceDate=${today}&from=${centro.id}&to=${turmero.id}`,
          )
          .expect(200)
      ).body as TripAvailability;
      expect(availability).toMatchObject({ headwayMinutes: 30, layout: null, capacity: 96 });

      // --- An open ticket: no seat to choose, the API numbers it.
      const person = (name: string) => ({
        firstName: name,
        lastName: 'Prueba',
        documentType: 'V',
        documentNumber: String(randomInt(10_000_000, 30_000_000)),
      });
      const book = (passengers: object[]) =>
        http().post('/api/v1/bookings').set('Authorization', passenger.auth).send({
          scheduleId,
          serviceDate: today,
          fromStopId: centro.id,
          toStopId: turmero.id,
          passengers,
        });
      await book([{ ...person('Ana'), seatNumber: '1' }])
        .expect(400)
        .expect((res) => expect(res.body.error.message).toMatch(/open tickets/));
      const booking = (await book([person('Ana'), person('Luis')]).expect(201)).body as Booking;
      expect(booking.passengers.map((p) => p.seatNumber)).toEqual(['1', '2']);
      expect(booking.trip).toMatchObject({ headwayMinutes: 30 });
      // Valid from the first unit until the last one arrives (23:59 + 35 min, after midnight).
      const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
      expect(booking.trip).toMatchObject({
        departsAt: `${today}T00:00:00-04:00`,
        arrivesAt: `${tomorrow}T00:34:00-04:00`,
      });

      // --- Paid like any booking: 2 × 0.50 + 10 % service fee.
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
      expect(paid).toMatchObject({ status: 'confirmed', total: { amount: '1.10' } });
      // The next ticket of the day takes the next number.
      const next = (await book([person('Rosa')]).expect(201)).body as Booking;
      expect(next.passengers[0]!.seatNumber).toBe('3');

      // --- The driver (now allowed to validate) boards the ticket on any unit and earns it.
      const validate = (qr: string) =>
        http()
          .post(`${org}/tickets/validate`)
          .set('Authorization', driver.auth)
          .send({ qr })
          .expect(200)
          .then((res) => res.body as TicketValidation);
      expect((await validate(paid.passengers[0]!.ticket!.qr)).result).toBe('boarded');
      expect((await validate(paid.passengers[1]!.ticket!.qr)).result).toBe('boarded');
      const [stored] = await db
        .select({ driver: bookings.boardingDriverUserId })
        .from(bookings)
        .where(eq(bookings.id, booking.id));
      expect(stored?.driver).toBe(driver.user.id);
      const earnings = (
        await http().get('/api/v1/me/earnings').set('Authorization', driver.auth).expect(200)
      ).body as DriverEarnings;
      expect(earnings.balances).toEqual([
        expect.objectContaining({
          organization: expect.objectContaining({ id: organization.id }),
          currency: 'USD',
          balance: '1.00',
        }),
      ]);
    },
  );
});
