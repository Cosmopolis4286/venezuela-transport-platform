import { mkdtemp } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  DriverEarnings,
  DriverTaxiBoard,
  FleetVehicle,
  IndependentLine,
  Organization,
  OrganizationMembershipSummary,
  PlatformRole,
  ProviderApplication,
  Stop,
  TaxiRide,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { memberships } from '../src/modules/organizations/organizations.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';
const PDF = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n`);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png'),
]);
const nextYear = `${new Date().getFullYear() + 1}-12-31`;
const uniqueRif = () => `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`;

/** Independent drivers in a line the platform runs (ADR-039). */
describe.runIf(expectDatabase)('Independent drivers (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.FILE_STORAGE_LOCAL_DIR = await mkdtemp(join(tmpdir(), 'vtp-independents-'));
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

  const person = async (platformRole?: PlatformRole) => {
    const res = (
      await http()
        .post('/api/v1/auth/register')
        .send({
          email: `independent-${randomUUID()}@example.com`,
          password: 'una frase larga de prueba',
          firstName: 'Persona',
          lastName: 'Prueba',
          client: 'transport',
          acceptTerms: true,
        })
        .expect(201)
    ).body as AuthResponse;
    if (platformRole) {
      await app
        .get(DatabaseService)
        .db.update(users)
        .set({ platformRole })
        .where(eq(users.id, res.user.id));
    }
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user };
  };
  const reason = (res: request.Response) =>
    (res.body as { error: { reason?: string } }).error.reason;

  it(
    'lets platform admins run a line where approved independents drive only their own vehicle',
    { timeout: 30_000 },
    async () => {
      const [admin, reviewer] = [await person('admin'), await person('reviewer')];

      // --- Only platform admins create the line, one per vehicle type: active, and they own it.
      const body = {
        type: 'moto_line',
        legalName: `VTP Independientes ${run}`,
        tradeName: 'VTP',
        rif: uniqueRif(),
      };
      await http()
        .post('/api/v1/admin/independent-lines')
        .set('Authorization', reviewer.auth)
        .send(body)
        .expect(403);
      const first = await http()
        .post('/api/v1/admin/independent-lines')
        .set('Authorization', admin.auth)
        .send(body);
      let line: Organization;
      if (first.status === 201) {
        const created = first.body as OrganizationMembershipSummary;
        expect(created.role).toBe('owner');
        line = created.organization;
      } else {
        // The sample data or an earlier run made it: this admin joins it as an owner.
        expect(reason(first)).toBe('INDEPENDENT_LINE_EXISTS');
        const lines = (
          await http()
            .get('/api/v1/admin/independent-lines')
            .set('Authorization', admin.auth)
            .expect(200)
        ).body as IndependentLine[];
        line = lines.find((l) => l.organization.type === 'moto_line')!.organization;
        await app
          .get(DatabaseService)
          .db.insert(memberships)
          .values({ organizationId: line.id, userId: admin.user.id, role: 'owner' });
      }
      expect(line).toMatchObject({ status: 'active', operatedByPlatform: true, type: 'moto_line' });
      // A second line for motorcycles is refused: drivers join without choosing.
      expect(
        reason(
          await http()
            .post('/api/v1/admin/independent-lines')
            .set('Authorization', admin.auth)
            .send({ ...body, rif: uniqueRif() })
            .expect(409),
        ),
      ).toBe('INDEPENDENT_LINE_EXISTS');
      const url = `/api/v1/organizations/${line.id}`;
      const before = (
        await http()
          .get('/api/v1/admin/independent-lines')
          .set('Authorization', admin.auth)
          .expect(200)
      ).body as IndependentLine[];
      const counts = before.find((l) => l.organization.id === line.id)!;

      // Companies and lines are not listed anywhere for applicants.
      await http()
        .get('/api/v1/organizations/directory')
        .set('Authorization', reviewer.auth)
        .expect(404);

      // --- An independent driver applies with their motorcycle: no role or company to choose.
      const driver = await person();
      const application = (extra: object) =>
        http()
          .post('/api/v1/me/application')
          .set('Authorization', driver.auth)
          .send({
            mode: 'motorcycle',
            firstName: 'Iván',
            lastName: 'Independiente',
            documentType: 'V',
            documentNumber: `V-${randomInt(10_000_000, 30_000_000)}`,
            birthDate: '1990-04-21',
            ...extra,
          });
      expect(reason(await application({}).expect(409))).toBe('INDEPENDENT_NEEDS_VEHICLE');
      await application({ desiredRole: 'dispatcher' }).expect(400);
      const plate = `IN${randomInt(100, 999)}DE`;
      const created = (
        await application({
          vehicle: { plate, make: 'Bera', model: 'SBR', year: 2022, color: 'Rojo' },
        }).expect(201)
      ).body as ProviderApplication;
      expect(created).toMatchObject({ mode: 'motorcycle', organization: { id: line.id } });
      const upload = (kind: string, file: Buffer, name: string, expiresOn?: string) => {
        const req = http()
          .put(`/api/v1/me/application/documents/${kind}`)
          .set('Authorization', driver.auth)
          .attach('file', file, name);
        return (expiresOn ? req.field('expiresOn', expiresOn) : req).expect(200);
      };
      await upload('identity_document', PNG, 'cedula.png');
      await upload('driver_license', PDF('licencia'), 'licencia.pdf', nextYear);
      await upload('medical_certificate', PDF('medico'), 'medico.pdf');
      await upload('vehicle_registration', PDF('carnet'), 'carnet.pdf');
      const ready = (await upload('liability_insurance', PDF('rcv'), 'rcv.pdf', nextYear))
        .body as ProviderApplication;
      await http()
        .post('/api/v1/me/application/submit')
        .set('Authorization', driver.auth)
        .expect(200);

      // --- The reviewer approves: the driver joins at once, with the vehicle marked as theirs.
      const approved = (
        await http()
          .post(`/api/v1/admin/applications/${created.id}/review`)
          .set('Authorization', reviewer.auth)
          .send({
            decision: 'approve',
            documents: ready.documents.map((d) => ({ documentId: d.id, status: 'accepted' })),
          })
          .expect(200)
      ).body as ProviderApplication;
      expect(approved).toMatchObject({ status: 'approved', organizationDecision: 'accepted' });
      const membership = (await http().get(url).set('Authorization', driver.auth).expect(200))
        .body as OrganizationMembershipSummary;
      expect(membership.role).toBe('driver');
      const fleet = (
        await http().get(`${url}/vehicles`).set('Authorization', admin.auth).expect(200)
      ).body as FleetVehicle[];
      const own = fleet.find((v) => v.plate === plate)!;
      expect(own).toMatchObject({ mode: 'motorcycle', owner: { userId: driver.user.id } });

      // The line also has a vehicle of its own: the independent never sees nor uses it.
      const linesVehicle = (
        await http()
          .post(`${url}/vehicles`)
          .set('Authorization', admin.auth)
          .send({ plate: `VT${randomInt(100, 999)}PL` })
          .expect(201)
      ).body as FleetVehicle;
      const board = (
        await http().get('/api/v1/me/taxi').set('Authorization', driver.auth).expect(200)
      ).body as DriverTaxiBoard;
      expect(
        board.lines.find((l) => l.organization.id === line.id)?.vehicles.map((v) => v.id),
      ).toEqual([own.id]);

      // --- A stretch ride: the platform sets the fare; the driver takes it with their vehicle.
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({
              kind: 'stop',
              name: `${name} ${run}`,
              city: `${name} ${run}`,
              state: 'Bolívar',
            })
            .expect(201)
        ).body as Stop;
      const [a, b] = [await stop('Indep A'), await stop('Indep B')];
      const zone = (
        await http()
          .post('/api/v1/admin/zones')
          .set('Authorization', admin.auth)
          .send({ name: `Indep ${run}`, slug: `indep-${run}`, status: 'active' })
          .expect(201)
      ).body as { id: string };
      for (const s of [a, b]) {
        await http()
          .patch(`/api/v1/admin/stops/${s.id}`)
          .set('Authorization', admin.auth)
          .send({ zoneId: zone.id })
          .expect(200);
      }
      await http()
        .put(`${url}/taxi/stretch-fares`)
        .set('Authorization', admin.auth)
        .send({
          fares: [{ stopIds: [a.id, b.id], mode: 'motorcycle', amount: '2.00', currency: 'USD' }],
        })
        .expect(200);
      const passenger = await person();
      const ride = (
        await http()
          .post('/api/v1/me/taxi-rides')
          .set('Authorization', passenger.auth)
          .send({
            kind: 'stretch',
            fromStopId: a.id,
            toStopId: b.id,
            mode: 'motorcycle',
            address: 'Calle 1, casa verde',
            passengers: 1,
          })
          .expect(201)
      ).body as TaxiRide;
      const accept = (vehicleId: string) =>
        http()
          .post(`/api/v1/me/taxi/rides/${ride.id}/accept`)
          .set('Authorization', driver.auth)
          .send({ organizationId: line.id, vehicleId });
      expect(reason(await accept(linesVehicle.id).expect(409))).toBe('VEHICLE_NOT_YOURS');
      await accept(own.id).expect(200);
      const ride$ = (rideId: string) =>
        http().get(`/api/v1/me/taxi-rides/${rideId}`).set('Authorization', passenger.auth);
      const finish = async (rideId: string) => {
        const { pickupCode } = (await ride$(rideId).expect(200)).body as TaxiRide;
        await http()
          .post(`/api/v1/me/taxi/rides/${rideId}/pickup`)
          .set('Authorization', driver.auth)
          .send(pickupCode ? { pickupCode } : {})
          .expect(200);
        await http()
          .post(`/api/v1/me/taxi/rides/${rideId}/complete`)
          .set('Authorization', driver.auth)
          .send({})
          .expect(200);
      };
      await finish(ride.id);

      // --- A ride paid with a trip pack: the fare is the independent driver's, not the line's.
      await http()
        .put(`/api/v1/admin/organizations/${line.id}/policy`)
        .set('Authorization', admin.auth)
        .send({ commissionRate: null, refundTiers: null, acceptsTripPacks: true })
        .expect(200);
      const product = (
        await http()
          .post('/api/v1/admin/trip-pack-products')
          .set('Authorization', admin.auth)
          .send({
            zoneId: zone.id,
            stopIds: [a.id, b.id],
            mode: 'motorcycle',
            trips: 5,
            price: '8',
            currency: 'USD',
            maxFare: '1.50',
          })
          .expect(201)
      ).body as { id: string };
      const pack = (
        await http()
          .post('/api/v1/me/trip-packs')
          .set('Authorization', passenger.auth)
          .send({ productId: product.id })
          .expect(201)
      ).body as { id: string };
      const payment = (
        await http()
          .post(`/api/v1/me/trip-packs/${pack.id}/payments`)
          .set('Authorization', passenger.auth)
          .send({ method: 'usdt' })
          .expect(201)
      ).body as { id: string };
      await http()
        .post(`/api/v1/me/payments/${payment.id}/simulate`)
        .set('Authorization', passenger.auth)
        .send({})
        .expect(200);
      const packRide = (
        await http()
          .post('/api/v1/me/taxi-rides')
          .set('Authorization', passenger.auth)
          .send({
            kind: 'stretch',
            fromStopId: a.id,
            toStopId: b.id,
            mode: 'motorcycle',
            address: 'Calle 1, casa verde',
            passengers: 1,
            tripPackId: pack.id,
          })
          .expect(201)
      ).body as TaxiRide;
      await http()
        .post(`/api/v1/me/taxi/rides/${packRide.id}/accept`)
        .set('Authorization', driver.auth)
        .send({ organizationId: line.id, vehicleId: own.id })
        .expect(200);
      await finish(packRide.id);
      const earnings = (
        await http().get('/api/v1/me/earnings').set('Authorization', driver.auth).expect(200)
      ).body as DriverEarnings;
      // The pack pays at most 1.50 per trip (its cap), below the line's 2.00 fare.
      expect(earnings.balances).toEqual([
        expect.objectContaining({
          organization: expect.objectContaining({ id: line.id }),
          currency: 'USD',
          earned: '1.50',
          balance: '1.50',
        }),
      ]);

      // --- Platform admins follow the line from Administración.
      const lines = (
        await http()
          .get('/api/v1/admin/independent-lines')
          .set('Authorization', admin.auth)
          .expect(200)
      ).body as IndependentLine[];
      expect(lines.find((l) => l.organization.id === line.id)).toMatchObject({
        drivers: counts.drivers + 1,
        vehicles: counts.vehicles + 2,
      });
      await http()
        .get('/api/v1/admin/independent-lines')
        .set('Authorization', reviewer.auth)
        .expect(403);

      // --- The independent deletes their account: their vehicle stops running and is no longer theirs.
      await http().delete('/api/v1/me').set('Authorization', driver.auth).expect(204);
      const after = (
        (await http().get(`${url}/vehicles`).set('Authorization', admin.auth).expect(200))
          .body as FleetVehicle[]
      ).find((v) => v.id === own.id);
      expect(after).toMatchObject({ active: false, owner: null });
    },
  );
});
