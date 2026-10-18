import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  OrganizationInvitation,
  OrganizationMembershipSummary,
  OtpChallengeResponse,
  ReceivedInvitation,
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
    const message = this.sent.findLast((m) => m.destination === destination);
    if (!message) throw new Error(`No code sent to ${destination}`);
    return message.code;
  }
}

/** Unique, format-valid RIF for each test run. */
const uniqueRif = () => `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`;
const uniquePhone = () => {
  const digits = String(randomInt(1_000_000, 9_999_999));
  return { local: `0414-${digits}`, e164: `+58414${digits}` };
};

describe.runIf(expectDatabase)('Organizations (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
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
  });

  /** Signs in by one-time code, so the contact is verified. Returns a bearer header. */
  const signIn = async (
    channel: 'email' | 'sms',
    destination: string,
    normalized = destination,
  ) => {
    const challenge = (
      await http().post('/api/v1/auth/otp/request').send({ channel, destination }).expect(202)
    ).body as OtpChallengeResponse;
    const res = (
      await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(normalized), client: 'web' })
        .expect(200)
    ).body as AuthResponse;
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user };
  };
  const newUser = () => signIn('email', `org-e2e-${randomUUID()}@example.com`);

  const createOrganization = async (auth: string, type = 'bus_company') =>
    (
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', auth)
        .send({
          type,
          legalName: 'Expresos de Prueba C.A.',
          rif: uniqueRif(),
          city: 'Barquisimeto',
        })
        .expect(201)
    ).body as OrganizationMembershipSummary;

  const invite = (auth: string, organizationId: string, body: object) =>
    http()
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('Authorization', auth)
      .send(body);

  /** Invites by e-mail and has a fresh user accept. Returns the new member. */
  const addMember = async (ownerAuth: string, organizationId: string, role: string) => {
    const email = `member-${randomUUID()}@example.com`;
    await invite(ownerAuth, organizationId, {
      contactKind: 'email',
      destination: email,
      role,
    }).expect(201);
    const member = await signIn('email', email);
    const [received] = (
      await http().get('/api/v1/me/invitations').set('Authorization', member.auth).expect(200)
    ).body as ReceivedInvitation[];
    await http()
      .post(`/api/v1/me/invitations/${received!.id}/accept`)
      .set('Authorization', member.auth)
      .expect(204);
    return member;
  };

  const makeReviewer = async (userId: string) => {
    const database = app.get(DatabaseService);
    await database.db.update(users).set({ platformRole: 'reviewer' }).where(eq(users.id, userId));
  };

  describe('registration', () => {
    it('creates a pending organization owned by the caller, with a normalized RIF', async () => {
      const owner = await newUser();
      const res = await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({ type: 'bus_company', legalName: 'Expresos del Llano C.A.', rif: 'j123456780' })
        .expect((r) => expect([201, 409]).toContain(r.status));
      if (res.status === 201) {
        expect(res.body.organization).toMatchObject({
          rif: 'J-12345678-0',
          status: 'pending_review',
        });
        expect(res.body.role).toBe('owner');
      }

      const summary = await createOrganization(owner.auth);
      expect(summary.permissions).toEqual(
        expect.arrayContaining(['members.manage', 'trips.drive']),
      );
      const mine = (
        await http().get('/api/v1/me/organizations').set('Authorization', owner.auth).expect(200)
      ).body as OrganizationMembershipSummary[];
      expect(mine.map((m) => m.organization.id)).toContain(summary.organization.id);
    });

    it('rejects duplicate and malformed RIFs', async () => {
      const owner = await newUser();
      const rif = uniqueRif();
      const body = { type: 'taxi_line', legalName: 'Taxis Unidos', rif };
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send(body)
        .expect(201);
      const dup = await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send(body)
        .expect(409);
      expect(dup.body.error.code).toBe('CONFLICT');
      await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({ ...body, rif: 'X-1' })
        .expect(400);
    });

    it('limits how many organizations one person can have awaiting review', async () => {
      const owner = await newUser();
      for (let i = 0; i < 5; i++) await createOrganization(owner.auth);
      const res = await http()
        .post('/api/v1/organizations')
        .set('Authorization', owner.auth)
        .send({ type: 'taxi_line', legalName: 'Una más', rif: uniqueRif() })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('hides organizations from non-members', async () => {
      const owner = await newUser();
      const stranger = await newUser();
      const { organization } = await createOrganization(owner.auth);
      await http()
        .get(`/api/v1/organizations/${organization.id}`)
        .set('Authorization', stranger.auth)
        .expect(404);
      await http()
        .get('/api/v1/organizations/not-a-uuid')
        .set('Authorization', owner.auth)
        .expect(404);
    });
  });

  describe('invitations and roles', () => {
    it('invites a driver by phone; the driver accepts after signing in with that phone', async () => {
      const owner = await newUser();
      const { organization } = await createOrganization(owner.auth);
      const phone = uniquePhone();

      const created = (
        await invite(owner.auth, organization.id, {
          contactKind: 'phone',
          destination: phone.local,
          role: 'driver',
        }).expect(201)
      ).body as OrganizationInvitation;
      expect(created).toMatchObject({ destination: phone.e164, status: 'pending', role: 'driver' });
      await invite(owner.auth, organization.id, {
        contactKind: 'phone',
        destination: phone.e164,
        role: 'driver',
      }).expect(409);

      const driver = await signIn('sms', phone.local, phone.e164);
      const received = (
        await http().get('/api/v1/me/invitations').set('Authorization', driver.auth).expect(200)
      ).body as ReceivedInvitation[];
      expect(received).toEqual([expect.objectContaining({ id: created.id, role: 'driver' })]);
      await http()
        .post(`/api/v1/me/invitations/${created.id}/accept`)
        .set('Authorization', driver.auth)
        .expect(204);
      await http()
        .post(`/api/v1/me/invitations/${created.id}/accept`)
        .set('Authorization', driver.auth)
        .expect(404);

      const [membership] = (
        await http().get('/api/v1/me/organizations').set('Authorization', driver.auth).expect(200)
      ).body as OrganizationMembershipSummary[];
      expect(membership).toMatchObject({ role: 'driver', permissions: ['trips.drive'] });

      // Drivers can see their organization but not manage it.
      await http()
        .get(`/api/v1/organizations/${organization.id}`)
        .set('Authorization', driver.auth)
        .expect(200);
      await http()
        .get(`/api/v1/organizations/${organization.id}/members`)
        .set('Authorization', driver.auth)
        .expect(403);
      await http()
        .patch(`/api/v1/organizations/${organization.id}`)
        .set('Authorization', driver.auth)
        .send({ city: 'Caracas' })
        .expect(403);

      const members = await http()
        .get(`/api/v1/organizations/${organization.id}/members`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(members.body.map((m: { role: string }) => m.role).sort()).toEqual(['driver', 'owner']);
    });

    it('only allows roles that exist for the organization type (taxi lines)', async () => {
      const owner = await newUser();
      const { organization } = await createOrganization(owner.auth, 'taxi_line');
      const notAllowed = await invite(owner.auth, organization.id, {
        contactKind: 'email',
        destination: `x-${randomUUID()}@example.com`,
        role: 'ticket_agent',
      }).expect(400);
      expect(notAllowed.body.error.message).toContain('taxi_line');
      const dispatcher = await addMember(owner.auth, organization.id, 'dispatcher');
      const [membership] = (
        await http()
          .get('/api/v1/me/organizations')
          .set('Authorization', dispatcher.auth)
          .expect(200)
      ).body as OrganizationMembershipSummary[];
      expect(membership).toMatchObject({ role: 'dispatcher', organization: { type: 'taxi_line' } });
    });

    it('shows invitations only for verified contacts', async () => {
      const owner = await newUser();
      const { organization } = await createOrganization(owner.auth);
      const email = `unverified-${randomUUID()}@example.com`;
      await invite(owner.auth, organization.id, {
        contactKind: 'email',
        destination: email,
        role: 'inspector',
      }).expect(201);

      // Registered with a password: the e-mail is not verified yet.
      const registered = (
        await http()
          .post('/api/v1/auth/register')
          .send({
            email,
            password: 'una-clave-larga-y-segura',
            firstName: 'Luis',
            lastName: 'Rojas',
            client: 'web',
          })
          .expect(201)
      ).body as AuthResponse;
      const auth = `Bearer ${registered.tokens.accessToken}`;
      expect(
        (await http().get('/api/v1/me/invitations').set('Authorization', auth).expect(200)).body,
      ).toEqual([]);

      const challenge = (
        await http()
          .post('/api/v1/me/contact-verification/request')
          .set('Authorization', auth)
          .send({ channel: 'email', destination: email })
          .expect(202)
      ).body as OtpChallengeResponse;
      await http()
        .post('/api/v1/me/contact-verification/confirm')
        .set('Authorization', auth)
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(email) })
        .expect(200);
      expect(
        (await http().get('/api/v1/me/invitations').set('Authorization', auth).expect(200)).body,
      ).toHaveLength(1);
    });

    it('lets admins revoke invitations and invitees decline them', async () => {
      const owner = await newUser();
      const { organization } = await createOrganization(owner.auth);
      const email = `revoke-${randomUUID()}@example.com`;
      const invitation = (
        await invite(owner.auth, organization.id, {
          contactKind: 'email',
          destination: email,
          role: 'ticket_agent',
        }).expect(201)
      ).body as OrganizationInvitation;
      await http()
        .delete(`/api/v1/organizations/${organization.id}/invitations/${invitation.id}`)
        .set('Authorization', owner.auth)
        .expect(204);
      const invitee = await signIn('email', email);
      expect(
        (await http().get('/api/v1/me/invitations').set('Authorization', invitee.auth).expect(200))
          .body,
      ).toEqual([]);

      const second = (
        await invite(owner.auth, organization.id, {
          contactKind: 'email',
          destination: email,
          role: 'ticket_agent',
        }).expect(201)
      ).body as OrganizationInvitation;
      await http()
        .post(`/api/v1/me/invitations/${second.id}/decline`)
        .set('Authorization', invitee.auth)
        .expect(204);
      expect(
        (
          await http()
            .get('/api/v1/me/organizations')
            .set('Authorization', invitee.auth)
            .expect(200)
        ).body,
      ).toEqual([]);
    });

    it('protects owners: admins cannot manage them and the last owner cannot leave', async () => {
      const owner = await newUser();
      const { organization } = await createOrganization(owner.auth);
      const admin = await addMember(owner.auth, organization.id, 'admin');
      const base = `/api/v1/organizations/${organization.id}`;

      await invite(admin.auth, organization.id, {
        contactKind: 'email',
        destination: `o-${randomUUID()}@example.com`,
        role: 'owner',
      }).expect(403);
      await http()
        .patch(`${base}/members/${owner.user.id}`)
        .set('Authorization', admin.auth)
        .send({ role: 'driver' })
        .expect(403);
      await http()
        .delete(`${base}/members/${owner.user.id}`)
        .set('Authorization', admin.auth)
        .expect(403);

      const lastOwner = await http()
        .patch(`${base}/members/${owner.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'admin' })
        .expect(409);
      expect(lastOwner.body.error.code).toBe('CONFLICT');

      // Promote the admin to owner; now the original owner may step down.
      await http()
        .patch(`${base}/members/${admin.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'owner' })
        .expect(204);
      await http()
        .patch(`${base}/members/${owner.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'admin' })
        .expect(204);

      const dispatcher = await addMember(admin.auth, organization.id, 'dispatcher');
      await http()
        .delete(`${base}/members/${dispatcher.user.id}`)
        .set('Authorization', owner.auth)
        .expect(204);
      await http().get(base).set('Authorization', dispatcher.auth).expect(404);
    });
  });

  describe('platform review', () => {
    it('restricts the review queue to platform staff and enforces valid transitions', async () => {
      const owner = await newUser();
      const { organization } = await createOrganization(owner.auth, 'terminal');
      await http().get('/api/v1/admin/organizations').set('Authorization', owner.auth).expect(403);

      const reviewer = await newUser();
      await makeReviewer(reviewer.user.id);
      const queue = await http()
        .get('/api/v1/admin/organizations')
        .set('Authorization', reviewer.auth)
        .expect(200);
      expect(queue.body.map((o: { id: string }) => o.id)).toContain(organization.id);

      const review = (body: object) =>
        http()
          .post(`/api/v1/admin/organizations/${organization.id}/review`)
          .set('Authorization', reviewer.auth)
          .send(body);
      await review({ decision: 'reject' }).expect(400);
      await review({ decision: 'suspend', notes: 'x' }).expect(409);
      const approved = await review({ decision: 'approve' }).expect(200);
      expect(approved.body.status).toBe('active');
      await review({ decision: 'approve' }).expect(409);
      const suspended = await review({ decision: 'suspend', notes: 'Documentos vencidos' }).expect(
        200,
      );
      expect(suspended.body.status).toBe('suspended');

      const [membership] = (
        await http().get('/api/v1/me/organizations').set('Authorization', owner.auth).expect(200)
      ).body as OrganizationMembershipSummary[];
      expect(membership!.organization.status).toBe('suspended');
    });
  });
});
