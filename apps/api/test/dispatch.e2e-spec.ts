import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  presetLayout,
  type AuthResponse,
  type DispatchBoard,
  type DispatchDeparture,
  type DriverManifest,
  type DriverTrip,
  type FleetVehicle,
  type OrganizationMembershipSummary,
  type OtpChallengeResponse,
  type ReceivedInvitation,
  type Route,
  type SeatLayout,
  type Stop,
  type TripSummary,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { addDays, todayInVenezuela } from '../src/modules/network/departures.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

class CapturingOtpSender implements OtpSender {
  readonly sent: OtpMessage[] = [];
  async send(message: OtpMessage): Promise<void> {
    this.sent.push(message);
  }
  codeFor(destination: string): string {
    const message = this.sent.findLast((m) => m.destination === destination);
    if (!message) throw new Error(`No code sent to ${destination}`);
    return message.code;
  }
}

describe.runIf(expectDatabase)('Dispatch (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.OTP_RESEND_SECONDS = '0';
    process.env.OTP_MAX_PER_HOUR = '100';
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { OTP_SENDER } = await import('../src/modules/identity/otp/otp-sender.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(otp)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const signIn = async (email = `dispatch-e2e-${randomUUID()}@example.com`) => {
    const challenge = (
      await http()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', destination: email })
        .expect(202)
    ).body as OtpChallengeResponse;
    const res = (
      await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(email), client: 'passenger' })
        .expect(200)
    ).body as AuthResponse;
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user, email };
  };

  const passenger = (seatNumber: string, n = randomInt(10_000_000, 30_000_000)) => ({
    seatNumber,
    firstName: 'Ana',
    lastName: `Viajera ${run}`,
    documentType: 'V',
    documentNumber: `${n}`,
  });

  it(
    'manages vehicles and assigns them and drivers to departures without overlaps',
    { timeout: 30_000 },
    async () => {
      // --- Setup: an approved bus company with a 10-hour route and three daily departures.
      const reviewer = await signIn();
      const db = app.get(DatabaseService).db;
      await db
        .update(users)
        .set({ platformRole: 'reviewer' })
        .where(eq(users.id, reviewer.user.id));
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', reviewer.auth)
            .send({ kind: 'terminal', name: `${name} ${run}`, city: name, state: 'Estado' })
            .expect(201)
        ).body as Stop;
      const [caracas, maracaibo] = [await stop('Caracas'), await stop('Maracaibo')];
      const owner = await signIn();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'bus_company',
            legalName: `Despacho ${run}`,
            rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
          })
          .expect(201)
      ).body as OrganizationMembershipSummary;
      await http()
        .post(`/api/v1/admin/organizations/${organization.id}/review`)
        .set('Authorization', reviewer.auth)
        .send({ decision: 'approve' })
        .expect(200);
      const org = `/api/v1/organizations/${organization.id}`;
      const layout = async (preset: 'sleeper_2_1' | 'coach_2_2') =>
        (
          await http()
            .post(`${org}/seat-layouts`)
            .set('Authorization', owner.auth)
            .send(presetLayout(preset))
            .expect(201)
        ).body as SeatLayout;
      const [sleeper, coach] = [await layout('sleeper_2_1'), await layout('coach_2_2')];
      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({
            name: 'Caracas – Maracaibo',
            stops: [
              { stopId: caracas.id, minutesFromOrigin: 0 },
              { stopId: maracaibo.id, minutesFromOrigin: 600 },
            ],
          })
          .expect(201)
      ).body as Route;
      const routeUrl = `${org}/routes/${route.id}`;
      await http()
        .put(`${routeUrl}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [
            { fromStopId: caracas.id, toStopId: maracaibo.id, amount: '25', currency: 'USD' },
          ],
        })
        .expect(200);
      const today = todayInVenezuela();
      for (const departureTime of ['08:00', '14:00', '20:00']) {
        await http()
          .post(`${routeUrl}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime,
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: today,
            serviceClass: 'executive',
            seatLayoutId: sleeper.id,
          })
          .expect(201);
      }
      await http()
        .post(`${routeUrl}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);

      // --- Staff.
      const addMember = async (role: string) => {
        const email = `dispatch-member-${randomUUID()}@example.com`;
        await http()
          .post(`${org}/invitations`)
          .set('Authorization', owner.auth)
          .send({ contactKind: 'email', destination: email, role })
          .expect(201);
        const member = await signIn(email);
        const [received] = (
          await http().get('/api/v1/me/invitations').set('Authorization', member.auth).expect(200)
        ).body as ReceivedInvitation[];
        await http()
          .post(`/api/v1/me/invitations/${received!.id}/accept`)
          .set('Authorization', member.auth)
          .expect(204);
        return member;
      };
      const [driver, dispatcher, agent] = [
        await addMember('driver'),
        await addMember('dispatcher'),
        await addMember('ticket_agent'),
      ];

      // --- Vehicles.
      const addVehicle = (auth: string, body: object) =>
        http().post(`${org}/vehicles`).set('Authorization', auth).send(body);
      await addVehicle(owner.auth, { plate: 'A1' }).expect(400);
      await addVehicle(dispatcher.auth, { plate: 'AB123CD' }).expect(403);
      const bus = (
        await addVehicle(owner.auth, {
          plate: ' ab-123 cd ',
          label: 'Unidad 12',
          seatLayoutId: sleeper.id,
        }).expect(201)
      ).body as FleetVehicle;
      expect(bus).toMatchObject({
        plate: 'AB123CD',
        label: 'Unidad 12',
        seatLayout: { id: sleeper.id, capacity: 30 },
        active: true,
      });
      expect(
        (await addVehicle(owner.auth, { plate: 'AB123CD' }).expect(409)).body.error.message,
      ).toMatch(/plate/);
      const coachBus = (
        await addVehicle(owner.auth, { plate: 'XY987ZW', seatLayoutId: coach.id }).expect(201)
      ).body as FleetVehicle;
      const spare = (await addVehicle(owner.auth, { plate: 'SP001AA' }).expect(201))
        .body as FleetVehicle;
      await addVehicle(owner.auth, { plate: 'ZZ111ZZ', seatLayoutId: randomUUID() }).expect(404);
      const listed = (
        await http().get(`${org}/vehicles`).set('Authorization', agent.auth).expect(200)
      ).body as FleetVehicle[];
      expect(listed.map((v) => v.plate)).toEqual(['AB123CD', 'SP001AA', 'XY987ZW']);

      // --- The board lists every departure of the day, booked or not.
      const date = addDays(today, 1);
      await http()
        .get(`${org}/dispatch`)
        .query({ date })
        .set('Authorization', agent.auth)
        .expect(403);
      await http()
        .get(`${org}/dispatch`)
        .query({ date: addDays(today, 400) })
        .set('Authorization', dispatcher.auth)
        .expect(400);
      const board = (
        await http()
          .get(`${org}/dispatch`)
          .query({ date })
          .set('Authorization', dispatcher.auth)
          .expect(200)
      ).body as DispatchBoard;
      expect(board.departures.map((d) => [d.departsAt, d.arrivesAt, d.tripId])).toEqual([
        [`${date}T08:00:00-04:00`, `${date}T18:00:00-04:00`, null],
        [`${date}T14:00:00-04:00`, `${addDays(date, 1)}T00:00:00-04:00`, null],
        [`${date}T20:00:00-04:00`, `${addDays(date, 1)}T06:00:00-04:00`, null],
      ]);
      expect(board.vehicles.map((v) => v.plate)).toEqual(['AB123CD', 'SP001AA', 'XY987ZW']);
      expect(board.drivers.map((d) => d.userId).sort()).toEqual(
        [owner.user.id, driver.user.id].sort(),
      );
      const [morning, afternoon, night] = board.departures as [
        DispatchDeparture,
        DispatchDeparture,
        DispatchDeparture,
      ];

      // --- Assignments.
      const assign = (
        departure: DispatchDeparture,
        vehicleId: string | null,
        driverUserId: string | null,
      ) =>
        http().put(`${org}/dispatch/assignment`).set('Authorization', dispatcher.auth).send({
          scheduleId: departure.scheduleId,
          serviceDate: departure.serviceDate,
          vehicleId,
          driverUserId,
        });
      // The driver's transport app is registered for push (console delivery in tests).
      await http()
        .post('/api/v1/me/push-devices')
        .set('Authorization', driver.auth)
        .send({
          token: `ExponentPushToken[driver${randomUUID().slice(0, 8)}]`,
          app: 'transport',
          platform: 'android',
          locale: 'es',
        })
        .expect(204);
      const assigned = (await assign(morning, bus.id, driver.user.id).expect(200))
        .body as DispatchDeparture;
      await app.get(NotificationsService).settled();
      expect(
        await db
          .select({ kind: notifications.kind, reference: notifications.reference })
          .from(notifications)
          .where(eq(notifications.userId, driver.user.id)),
      ).toEqual([{ kind: 'trip_assigned', reference: assigned.tripId }]);
      expect(assigned).toMatchObject({
        tripId: expect.any(String),
        vehicle: { id: bus.id, plate: 'AB123CD', label: 'Unidad 12' },
        driver: { userId: driver.user.id },
        soldSeats: 0,
      });
      const conflictMessage = async (res: Promise<request.Response>) =>
        ((await res).body as { error: { message: string } }).error.message;
      const reason = async (res: Promise<request.Response>) =>
        ((await res).body as { error: { reason?: string } }).error.reason;
      expect(await conflictMessage(assign(afternoon, coachBus.id, null).expect(409))).toMatch(
        /seat map/,
      );
      expect(await reason(assign(afternoon, coachBus.id, null).expect(409))).toBe(
        'VEHICLE_LAYOUT_MISMATCH',
      );
      expect(await reason(assign(afternoon, bus.id, null).expect(409))).toBe('VEHICLE_BUSY');
      expect(await reason(assign(afternoon, spare.id, driver.user.id).expect(409))).toBe(
        'DRIVER_BUSY',
      );
      expect(await conflictMessage(assign(afternoon, bus.id, null).expect(409))).toMatch(
        /vehicle is on another trip/,
      );
      expect(
        await conflictMessage(assign(afternoon, spare.id, driver.user.id).expect(409)),
      ).toMatch(/driver is on another trip/);
      await assign(afternoon, null, agent.user.id).expect(400);
      await assign(afternoon, randomUUID(), null).expect(404);
      await assign({ ...afternoon, scheduleId: randomUUID() }, spare.id, null).expect(404);
      await assign(night, bus.id, driver.user.id).expect(200);
      await http()
        .patch(`${org}/vehicles/${spare.id}`)
        .set('Authorization', owner.auth)
        .send({ active: false })
        .expect(200);
      expect(await conflictMessage(assign(afternoon, spare.id, null).expect(409))).toMatch(
        /inactive/,
      );

      // --- A passenger books the morning trip; the driver sees it and who rides, without documents.
      const ana = await signIn();
      await http()
        .post('/api/v1/bookings')
        .set('Authorization', ana.auth)
        .send({
          scheduleId: morning.scheduleId,
          serviceDate: date,
          fromStopId: caracas.id,
          toStopId: maracaibo.id,
          passengers: [passenger('3')],
        })
        .expect(201);
      const trips = (
        await http().get('/api/v1/me/driving').set('Authorization', driver.auth).expect(200)
      ).body as DriverTrip[];
      expect(trips.map((t) => [t.departsAt, t.heldSeats])).toEqual([
        [`${date}T08:00:00-04:00`, 1],
        [`${date}T20:00:00-04:00`, 0],
      ]);
      expect(trips[0]).toMatchObject({
        id: assigned.tripId,
        organization: { id: organization.id },
        from: { id: caracas.id },
        to: { id: maracaibo.id },
        arrivesAt: `${date}T18:00:00-04:00`,
        vehicle: { plate: 'AB123CD' },
      });
      const manifest = (
        await http()
          .get(`/api/v1/me/driving/${assigned.tripId}/passengers`)
          .set('Authorization', driver.auth)
          .expect(200)
      ).body as DriverManifest;
      expect(manifest.passengers).toEqual([
        expect.objectContaining({ seatNumber: '3', firstName: 'Ana', bookingStatus: 'held' }),
      ]);
      expect(manifest.passengers[0]).not.toHaveProperty('documentNumber');
      await http()
        .get(`/api/v1/me/driving/${assigned.tripId}/passengers`)
        .set('Authorization', ana.auth)
        .expect(404);

      // Operators see the assignment on the trip list.
      const listedTrips = (
        await http()
          .get(`${org}/trips`)
          .query({ date })
          .set('Authorization', owner.auth)
          .expect(200)
      ).body as TripSummary[];
      expect(listedTrips.find((t) => t.id === assigned.tripId)).toMatchObject({
        vehicle: { plate: 'AB123CD' },
        driver: { userId: driver.user.id },
        heldSeats: 1,
      });

      // --- Clearing the assignment frees the vehicle and the driver.
      await assign(morning, null, null).expect(200);
      await assign(afternoon, bus.id, driver.user.id).expect(409);
      await assign(night, null, null).expect(200);
      await assign(afternoon, bus.id, driver.user.id).expect(200);
      expect(
        (
          (await http().get('/api/v1/me/driving').set('Authorization', driver.auth).expect(200))
            .body as DriverTrip[]
        ).map((t) => t.departsAt),
      ).toEqual([`${date}T14:00:00-04:00`]);

      // A member who no longer drives stops seeing the trip.
      await http()
        .patch(`${org}/members/${driver.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'inspector' })
        .expect(204);
      expect(
        (await http().get('/api/v1/me/driving').set('Authorization', driver.auth).expect(200)).body,
      ).toEqual([]);
    },
  );
});
