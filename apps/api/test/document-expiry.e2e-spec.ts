import { mkdtemp } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AuthResponse,
  type DocumentRenewal,
  type DocumentRenewalForReview,
  type PlatformRole,
  type ProviderApplication,
} from '@vtp/shared-types';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { vehicleDocuments, vehicles } from '../src/modules/fleet/fleet.schema.js';
import { users } from '../src/modules/identity/identity.schema.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { DocumentExpiryService } from '../src/modules/onboarding/document-expiry.service.js';
import { applicationDocuments } from '../src/modules/onboarding/onboarding.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';
const PDF = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n`);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png'),
]);
const inDays = (days: number) => {
  const date = new Date(`${todayInVenezuela()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const nextYear = `${new Date().getFullYear() + 1}-12-31`;
const inTwoYears = `${new Date().getFullYear() + 2}-06-30`;
const uniqueRif = () => `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`;

/** Expiring documents of approved drivers (ADR-042): reminders, renewals and going offline. */
describe.runIf(expectDatabase)('Document expiry (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.FILE_STORAGE_LOCAL_DIR = await mkdtemp(join(tmpdir(), 'vtp-expiry-'));
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
          email: `expiry-${randomUUID()}@example.com`,
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
    'reminds drivers before their documents expire, takes them offline and lets them renew',
    { timeout: 30_000 },
    async () => {
      const [admin, reviewer] = [await person('admin'), await person('reviewer')];
      const db = app.get(DatabaseService).db;

      // The platform's car line (made here, or by the sample data or another test). Cars, so as
      // not to change the motorcycle line the independents test counts.
      const first = await http()
        .post('/api/v1/admin/independent-lines')
        .set('Authorization', admin.auth)
        .send({
          type: 'taxi_line',
          legalName: `VTP Taxis ${run}`,
          tradeName: 'VTP',
          rif: uniqueRif(),
        });
      if (first.status !== 201) expect(reason(first)).toBe('INDEPENDENT_LINE_EXISTS');

      // --- An independent driver whose licence expires in 10 days is approved.
      const driver = await person();
      const plate = `EX${randomInt(100, 999)}PI`;
      const created = (
        await http()
          .post('/api/v1/me/application')
          .set('Authorization', driver.auth)
          .send({
            mode: 'car',
            firstName: 'Elena',
            lastName: 'Vence',
            documentType: 'V',
            documentNumber: `V-${randomInt(10_000_000, 30_000_000)}`,
            birthDate: '1991-02-11',
            vehicle: { plate, make: 'Chevrolet', model: 'Aveo', year: 2012, color: 'Azul' },
          })
          .expect(201)
      ).body as ProviderApplication;
      const upload = (kind: string, file: Buffer, name: string, expiresOn?: string) => {
        const req = http()
          .put(`/api/v1/me/application/documents/${kind}`)
          .set('Authorization', driver.auth)
          .attach('file', file, name);
        return (expiresOn ? req.field('expiresOn', expiresOn) : req).expect(200);
      };
      await upload('identity_document', PNG, 'cedula.png');
      await upload('driver_license', PDF('licencia'), 'licencia.pdf', inDays(10));
      await upload('medical_certificate', PDF('medico'), 'medico.pdf', nextYear);
      await upload('vehicle_registration', PDF('carnet'), 'carnet.pdf');
      const ready = (await upload('liability_insurance', PDF('rcv'), 'rcv.pdf', nextYear))
        .body as ProviderApplication;

      // Renewing is only for approved drivers.
      expect(
        reason(
          await http()
            .put('/api/v1/me/application/renewals/driver_license')
            .set('Authorization', driver.auth)
            .attach('file', PDF('nueva'), 'nueva.pdf')
            .field('expiresOn', nextYear)
            .expect(409),
        ),
      ).toBe('APPLICATION_WRONG_STATUS');

      await http()
        .post('/api/v1/me/application/submit')
        .set('Authorization', driver.auth)
        .expect(200);
      await http()
        .post(`/api/v1/admin/applications/${created.id}/review`)
        .set('Authorization', reviewer.auth)
        .send({
          decision: 'approve',
          documents: ready.documents.map((d) => ({ documentId: d.id, status: 'accepted' })),
        })
        .expect(200);
      const mine = async () =>
        (await http().get('/api/v1/me/application').set('Authorization', driver.auth).expect(200))
          .body as ProviderApplication;
      expect((await mine()).expiring).toEqual([
        { kind: 'driver_license', expiresOn: inDays(10), expired: false },
      ]);

      // --- The sweep reminds them once per expiry date and stage.
      await http()
        .post('/api/v1/me/push-devices')
        .set('Authorization', driver.auth)
        .send({
          token: `ExponentPushToken[exp${randomUUID().slice(0, 8)}]`,
          app: 'transport',
          platform: 'android',
          locale: 'es',
        })
        .expect(204);
      const sweeper = app.get(DocumentExpiryService);
      const notices = async (kind: string) => {
        await app.get(NotificationsService).settled();
        return (
          await db
            .select({ kind: notifications.kind })
            .from(notifications)
            .where(and(eq(notifications.userId, driver.user.id), eq(notifications.channel, 'push')))
        ).filter((n) => n.kind === kind).length;
      };
      await sweeper.sweep();
      const reminded = await notices('document_expiring');
      expect(reminded).toBeGreaterThanOrEqual(1);
      await sweeper.sweep();
      expect(await notices('document_expiring')).toBe(reminded);

      // --- Online, the licence expires: the sweep takes them offline and they cannot reconnect.
      const online = () =>
        http()
          .put('/api/v1/me/taxi/availability')
          .set('Authorization', driver.auth)
          .send({ online: true });
      await online().expect(200);
      await db
        .update(applicationDocuments)
        .set({ expiresOn: inDays(-1) })
        .where(
          and(
            eq(applicationDocuments.applicationId, created.id),
            eq(applicationDocuments.kind, 'driver_license'),
          ),
        );
      expect((await sweeper.sweep()).offline).toBeGreaterThanOrEqual(1);
      expect(await notices('document_expiring')).toBeGreaterThan(reminded); // "it expired"
      expect(
        (await http().get('/api/v1/me/taxi').set('Authorization', driver.auth).expect(200)).body
          .online,
      ).toBe(false);
      expect(reason(await online().expect(409))).toBe('DRIVER_DOCUMENTS_EXPIRED');
      expect((await mine()).expiring).toEqual([
        { kind: 'driver_license', expiresOn: inDays(-1), expired: true },
      ]);

      // --- They upload a new licence: only renewable kinds, with a future expiry date.
      const renew = (kind: string, expiresOn?: string) => {
        const req = http()
          .put(`/api/v1/me/application/renewals/${kind}`)
          .set('Authorization', driver.auth)
          .attach('file', PDF(`nueva ${kind}`), 'nueva.pdf');
        return expiresOn ? req.field('expiresOn', expiresOn) : req;
      };
      await renew('identity_document', nextYear).expect(400);
      await renew('driver_license').expect(400);
      await renew('driver_license', inDays(-2)).expect(400);
      const pending = (await renew('driver_license', nextYear).expect(200))
        .body as ProviderApplication;
      expect(pending.renewals).toMatchObject([
        { kind: 'driver_license', status: 'pending', expiresOn: nextYear },
      ]);
      // Still blocked until staff accept it.
      expect(reason(await online().expect(409))).toBe('DRIVER_DOCUMENTS_EXPIRED');

      // --- Staff review it: drivers cannot, rejecting needs a reason.
      await http()
        .get('/api/v1/admin/document-renewals')
        .set('Authorization', driver.auth)
        .expect(403);
      const queue = (
        await http()
          .get('/api/v1/admin/document-renewals')
          .set('Authorization', reviewer.auth)
          .expect(200)
      ).body as DocumentRenewalForReview[];
      const item = queue.find((r) => r.applicationId === created.id)!;
      expect(item).toMatchObject({ kind: 'driver_license', currentExpiresOn: inDays(-1) });
      await http()
        .get(`/api/v1/admin/document-renewals/${item.id}/file`)
        .set('Authorization', reviewer.auth)
        .expect(200);
      const review = (id: string, body: object) =>
        http()
          .post(`/api/v1/admin/document-renewals/${id}/review`)
          .set('Authorization', reviewer.auth)
          .send(body);
      await review(item.id, { decision: 'reject' }).expect(400);
      const rejected = (
        await review(item.id, { decision: 'reject', reason: 'La foto no se lee.' }).expect(200)
      ).body as DocumentRenewal;
      expect(rejected).toMatchObject({ status: 'rejected', rejectionReason: 'La foto no se lee.' });
      expect(await notices('document_renewal_reviewed')).toBe(1);
      await review(item.id, { decision: 'accept' }).expect(409);
      expect((await mine()).renewals).toMatchObject([{ status: 'rejected' }]);

      // A legible copy is accepted: it replaces the licence and the driver goes online again.
      const again = (await renew('driver_license', nextYear).expect(200))
        .body as ProviderApplication;
      await review(again.renewals[0]!.id, { decision: 'accept' }).expect(200);
      const renewed = await mine();
      expect(renewed.documents.find((d) => d.kind === 'driver_license')).toMatchObject({
        expiresOn: nextYear,
        status: 'accepted',
      });
      expect(renewed.expiring).toEqual([]);
      expect(renewed.renewals).toEqual([]);
      await online().expect(200);

      // --- A renewed RCV policy also becomes the insurance of their car.
      const policy = (await renew('liability_insurance', inTwoYears).expect(200))
        .body as ProviderApplication;
      await review(policy.renewals[0]!.id, { decision: 'accept' }).expect(200);
      const [insurance] = await db
        .select({ expiresOn: vehicleDocuments.expiresOn })
        .from(vehicleDocuments)
        .innerJoin(vehicles, eq(vehicles.id, vehicleDocuments.vehicleId))
        .where(
          and(
            eq(vehicles.ownerUserId, driver.user.id),
            eq(vehicles.plate, plate),
            eq(vehicleDocuments.kind, 'insurance'),
          ),
        );
      expect(insurance?.expiresOn).toBe(inTwoYears);
    },
  );
});
