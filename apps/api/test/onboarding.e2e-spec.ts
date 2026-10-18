import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  OrganizationApplicant,
  OrganizationMembershipSummary,
  OtpChallengeResponse,
  ProviderApplication,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

class CapturingOtpSender implements OtpSender {
  readonly sent: OtpMessage[] = [];
  async send(message: OtpMessage): Promise<void> {
    this.sent.push(message);
  }
  codeFor(destination: string): string {
    return this.sent.findLast((m) => m.destination === destination)!.code;
  }
}

const PDF = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n`);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png'),
]);
const uniqueRif = () => `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`;
const nextYear = `${new Date().getFullYear() + 1}-12-31`;

const driverApplication = (organizationId?: string) => ({
  desiredRole: 'driver',
  organizationId,
  firstName: 'José',
  lastName: 'Rodríguez',
  documentType: 'V',
  documentNumber: `V-${randomInt(10_000_000, 30_000_000)}`,
  birthDate: '1990-04-21',
  state: 'Lara',
  city: 'Barquisimeto',
  providesVehicle: true,
  vehicle: { plate: 'ab 123 cd', make: 'Toyota', model: 'Corolla', year: 2015, color: 'Blanco' },
});

describe.runIf(expectDatabase)('Driver applications / KYC (e2e)', () => {
  let app: NestExpressApplication;
  let storageDir: string;
  const otp = new CapturingOtpSender();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vtp-kyc-'));
    process.env.FILE_STORAGE_LOCAL_DIR = storageDir;
    process.env.FILE_UPLOAD_MAX_BYTES = '4096';
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
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
    await rm(storageDir, { recursive: true, force: true });
  });

  const newUser = async () => {
    const email = `kyc-${randomUUID()}@example.com`;
    const challenge = (
      await http()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', destination: email })
        .expect(202)
    ).body as OtpChallengeResponse;
    const res = (
      await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(email), client: 'transport' })
        .expect(200)
    ).body as AuthResponse;
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user };
  };

  const reviewer = async () => {
    const staff = await newUser();
    await app
      .get(DatabaseService)
      .db.update(users)
      .set({ platformRole: 'reviewer' })
      .where(eq(users.id, staff.user.id));
    return staff;
  };

  /** A taxi line approved by the platform, with its owner. */
  const activeTaxiLine = async (staffAuth: string) => {
    const owner = await newUser();
    const { organization } = (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({ type: 'taxi_line', legalName: 'Taxis Unidos C.A.', rif: uniqueRif() })
        .expect(201)
    ).body as OrganizationMembershipSummary;
    await http()
      .post(`/api/v1/admin/organizations/${organization.id}/review`)
      .set('Authorization', staffAuth)
      .send({ decision: 'approve' })
      .expect(200);
    return { owner, organization };
  };

  const upload = (
    auth: string,
    kind: string,
    file: Buffer,
    fileName = `${kind}.pdf`,
    expiresOn?: string,
  ) => {
    const req = http()
      .put(`/api/v1/me/application/documents/${kind}`)
      .set('Authorization', auth)
      .attach('file', file, fileName);
    return expiresOn ? req.field('expiresOn', expiresOn) : req;
  };

  it('runs the whole flow: apply, upload, changes requested, approval, organization acceptance', async () => {
    const staff = await reviewer();
    const { owner, organization } = await activeTaxiLine(staff.auth);
    const driver = await newUser();

    const created = (
      await http()
        .post('/api/v1/me/application')
        .set('Authorization', driver.auth)
        .send(driverApplication(organization.id))
        .expect(201)
    ).body as ProviderApplication;
    expect(created).toMatchObject({
      status: 'draft',
      vehicle: { plate: 'AB123CD' },
      organization: { id: organization.id },
    });
    expect(created.missingDocuments).toEqual([
      'identity_document',
      'driver_license',
      'medical_certificate',
      'vehicle_registration',
      'liability_insurance',
    ]);
    await http()
      .post('/api/v1/me/application')
      .set('Authorization', driver.auth)
      .send(driverApplication())
      .expect(409);
    await http()
      .post('/api/v1/me/application/submit')
      .set('Authorization', driver.auth)
      .expect(400);

    await upload(driver.auth, 'identity_document', PNG, 'cedula.png').expect(200);
    await upload(driver.auth, 'driver_license', PDF('licencia'), 'licencia.pdf', nextYear).expect(
      200,
    );
    await upload(driver.auth, 'medical_certificate', PDF('medico')).expect(200);
    await upload(driver.auth, 'vehicle_registration', PDF('carnet')).expect(200);
    const complete = (
      await upload(driver.auth, 'liability_insurance', PDF('rcv'), 'poliza.pdf', nextYear).expect(
        200,
      )
    ).body as ProviderApplication;
    expect(complete.missingDocuments).toEqual([]);

    // Replacing a document keeps one file per kind and removes the old bytes.
    await upload(driver.auth, 'medical_certificate', PDF('medico v2')).expect(200);
    const files = await readdir(join(storageDir, 'kyc', created.id));
    expect(files).toHaveLength(5);

    const submitted = (
      await http()
        .post('/api/v1/me/application/submit')
        .set('Authorization', driver.auth)
        .expect(200)
    ).body as ProviderApplication;
    expect(submitted.status).toBe('submitted');
    await http()
      .patch('/api/v1/me/application')
      .set('Authorization', driver.auth)
      .send({ city: 'Caracas' })
      .expect(409);

    // Reviewer sees it, downloads a document, and asks for a new licence.
    const queue = (
      await http().get('/api/v1/admin/applications').set('Authorization', staff.auth).expect(200)
    ).body as ProviderApplication[];
    expect(queue.map((a) => a.id)).toContain(created.id);
    const licence = submitted.documents.find((d) => d.kind === 'driver_license')!;
    const file = await http()
      .get(`/api/v1/admin/applications/${created.id}/documents/${licence.id}/file`)
      .set('Authorization', staff.auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.headers['cache-control']).toBe('no-store');
    expect((file.body as Buffer).toString()).toContain('licencia');

    const review = (body: object) =>
      http()
        .post(`/api/v1/admin/applications/${created.id}/review`)
        .set('Authorization', staff.auth)
        .send(body);
    await review({ decision: 'approve' }).expect(400); // documents not accepted yet
    await review({ decision: 'request_changes' }).expect(400); // notes required
    const changes = (
      await review({
        decision: 'request_changes',
        notes: 'La licencia está ilegible',
        documents: [{ documentId: licence.id, status: 'rejected', reason: 'Ilegible' }],
      }).expect(200)
    ).body as ProviderApplication;
    expect(changes.status).toBe('changes_requested');

    const mine = (
      await http().get('/api/v1/me/application').set('Authorization', driver.auth).expect(200)
    ).body as ProviderApplication;
    expect(mine.reviewNotes).toBe('La licencia está ilegible');
    expect(mine.documents.find((d) => d.kind === 'driver_license')).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Ilegible',
    });
    await http()
      .post('/api/v1/me/application/submit')
      .set('Authorization', driver.auth)
      .expect(400); // rejected doc not replaced
    await upload(
      driver.auth,
      'driver_license',
      PDF('licencia nítida'),
      'licencia.pdf',
      nextYear,
    ).expect(200);
    const resubmitted = (
      await http()
        .post('/api/v1/me/application/submit')
        .set('Authorization', driver.auth)
        .expect(200)
    ).body as ProviderApplication;

    const approved = (
      await review({
        decision: 'approve',
        documents: resubmitted.documents.map((d) => ({ documentId: d.id, status: 'accepted' })),
      }).expect(200)
    ).body as ProviderApplication;
    expect(approved).toMatchObject({ status: 'approved', organizationDecision: 'pending' });
    const me = await http().get('/api/v1/me').set('Authorization', driver.auth).expect(200);
    expect(me.body.identityVerified).toBe(true);

    // The taxi line decides; it sees the applicant but no documents or ID numbers.
    const applicants = (
      await http()
        .get(`/api/v1/organizations/${organization.id}/applicants`)
        .set('Authorization', owner.auth)
        .expect(200)
    ).body as OrganizationApplicant[];
    expect(applicants).toEqual([
      expect.objectContaining({
        applicationId: created.id,
        decision: 'pending',
        desiredRole: 'driver',
      }),
    ]);
    expect(JSON.stringify(applicants)).not.toContain('documentNumber');
    await http()
      .get(`/api/v1/organizations/${organization.id}/applicants`)
      .set('Authorization', driver.auth)
      .expect(404);

    await http()
      .post(`/api/v1/organizations/${organization.id}/applicants/${created.id}/accept`)
      .set('Authorization', owner.auth)
      .expect(204);
    await http()
      .post(`/api/v1/organizations/${organization.id}/applicants/${created.id}/accept`)
      .set('Authorization', owner.auth)
      .expect(404);
    const memberships = (
      await http().get('/api/v1/me/organizations').set('Authorization', driver.auth).expect(200)
    ).body as OrganizationMembershipSummary[];
    expect(memberships).toEqual([
      expect.objectContaining({
        role: 'driver',
        organization: expect.objectContaining({ id: organization.id }),
      }),
    ]);
  });

  it('validates applicant data', async () => {
    const staff = await reviewer();
    const driver = await newUser();
    const post = (body: object) =>
      http().post('/api/v1/me/application').set('Authorization', driver.auth).send(body);

    await post({
      ...driverApplication(),
      birthDate: `${new Date().getFullYear() - 16}-01-01`,
    }).expect(400);
    await post({ ...driverApplication(), documentNumber: '12' }).expect(400);
    await post({ ...driverApplication(), vehicle: null }).expect(400);

    // Pending organizations cannot receive applications; taxi lines have no ticket agents.
    const owner = await newUser();
    const pending = (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({ type: 'bus_company', legalName: 'Pendiente C.A.', rif: uniqueRif() })
        .expect(201)
    ).body as OrganizationMembershipSummary;
    await post(driverApplication(pending.organization.id)).expect(400);
    const { organization } = await activeTaxiLine(staff.auth);
    await post({ ...driverApplication(organization.id), desiredRole: 'ticket_agent' }).expect(400);
  });

  it('rejects unrequired documents, disguised files and oversized uploads', async () => {
    const driver = await newUser();
    await http()
      .post('/api/v1/me/application')
      .set('Authorization', driver.auth)
      .send({ ...driverApplication(), providesVehicle: false, vehicle: null })
      .expect(201);

    await upload(driver.auth, 'liability_insurance', PDF('rcv')).expect(400); // no own vehicle → not required
    const disguised = await upload(
      driver.auth,
      'identity_document',
      Buffer.from('<script>alert(1)</script>'),
      'cedula.pdf',
    ).expect(400);
    expect(disguised.body.error.message).toContain('JPG, PNG or PDF');
    const tooLarge = await upload(
      driver.auth,
      'identity_document',
      Buffer.concat([PDF('x'), Buffer.alloc(5000)]),
    ).expect(413);
    expect(tooLarge.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    await upload(
      driver.auth,
      'driver_license',
      PDF('vencida'),
      'licencia.pdf',
      '2020-01-01',
    ).expect(400);
    await http()
      .put('/api/v1/me/application/documents/passport_selfie')
      .set('Authorization', driver.auth)
      .attach('file', PNG, 'x.png')
      .expect(400);
  });

  it('keeps documents private and staff-only areas restricted', async () => {
    const driver = await newUser();
    const stranger = await newUser();
    await http()
      .post('/api/v1/me/application')
      .set('Authorization', driver.auth)
      .send(driverApplication())
      .expect(201);
    const app1 = (await upload(driver.auth, 'identity_document', PNG, 'cedula.png').expect(200))
      .body as ProviderApplication;
    const doc = app1.documents[0]!;

    await http()
      .get(`/api/v1/me/application/documents/${doc.id}/file`)
      .set('Authorization', driver.auth)
      .expect(200);
    await http()
      .get(`/api/v1/me/application/documents/${doc.id}/file`)
      .set('Authorization', stranger.auth)
      .expect(404);
    await http().get('/api/v1/admin/applications').set('Authorization', driver.auth).expect(403);
    await http()
      .get(`/api/v1/admin/applications/${app1.id}/documents/${doc.id}/file`)
      .set('Authorization', stranger.auth)
      .expect(403);
  });

  it('lets a rejected applicant start over', async () => {
    const staff = await reviewer();
    const person = await newUser();
    await http()
      .post('/api/v1/me/application')
      .set('Authorization', person.auth)
      .send({
        ...driverApplication(),
        desiredRole: 'inspector',
        providesVehicle: false,
        vehicle: null,
      })
      .expect(201);
    const withDoc = (await upload(person.auth, 'identity_document', PNG, 'cedula.png').expect(200))
      .body as ProviderApplication;
    await http()
      .post('/api/v1/me/application/submit')
      .set('Authorization', person.auth)
      .expect(200);
    await http()
      .post(`/api/v1/admin/applications/${withDoc.id}/review`)
      .set('Authorization', staff.auth)
      .send({ decision: 'reject', notes: 'Documento no coincide' })
      .expect(200);
    const latest = (
      await http().get('/api/v1/me/application').set('Authorization', person.auth).expect(200)
    ).body;
    expect(latest.status).toBe('rejected');
    await http()
      .post('/api/v1/me/application')
      .set('Authorization', person.auth)
      .send({
        ...driverApplication(),
        desiredRole: 'inspector',
        providesVehicle: false,
        vehicle: null,
      })
      .expect(201);
  });
});
