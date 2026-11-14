import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  AuthResponse,
  FleetVehicle,
  OperatingZone,
  OtpChallengeResponse,
  Stop,
} from '@vtp/shared-types';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';
import type { OtpMessage, OtpSender } from '../src/modules/identity/otp/otp-sender.js';
import { taxiRides } from '../src/modules/taxi/taxi.schema.js';
import { asText, ConsoleWhatsappSender } from '../src/modules/whatsapp/whatsapp-sender.js';
import { whatsappChats, whatsappMessages } from '../src/modules/whatsapp/whatsapp.schema.js';
import { WhatsappService } from '../src/modules/whatsapp/whatsapp.service.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';
const SECRET = 'test-app-secret';

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

/** The WhatsApp menu, taxi and moto requests in the chat, and ride notices (ADR-038). */
describe.runIf(expectDatabase)('Automatic WhatsApp (e2e)', () => {
  let app: NestExpressApplication;
  const otp = new CapturingOtpSender();
  const whatsapp = new ConsoleWhatsappSender();
  const http = () => request(app.getHttpServer());
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.RATE_LIMIT_MAX = '10000';
    process.env.OTP_RESEND_SECONDS = '0';
    process.env.OTP_MAX_PER_HOUR = '100';
    process.env.WHATSAPP_DELIVERY = 'console';
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    process.env.PUBLIC_WEB_URL = 'https://example.test';
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { OTP_SENDER } = await import('../src/modules/identity/otp/otp-sender.js');
    const { WHATSAPP_SENDER } = await import('../src/modules/whatsapp/whatsapp-sender.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(otp)
      .overrideProvider(WHATSAPP_SENDER)
      .useValue(whatsapp)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.WHATSAPP_DELIVERY;
    await app?.close();
  });

  const signIn = async (role?: 'admin') => {
    const email = `wa-e2e-${randomUUID()}@example.com`;
    const challenge = (
      await http()
        .post('/api/v1/auth/otp/request')
        .send({ channel: 'email', destination: email })
        .expect(202)
    ).body as OtpChallengeResponse;
    const res = (
      await http()
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: otp.codeFor(email), client: 'web' })
        .expect(200)
    ).body as AuthResponse;
    if (role) {
      await app
        .get(DatabaseService)
        .db.update(users)
        .set({ platformRole: role })
        .where(eq(users.id, res.user.id));
    }
    return { auth: `Bearer ${res.tokens.accessToken}`, user: res.user };
  };

  /** What Meta posts when the person writes, signed with the app secret. */
  const deliver = (
    phone: string,
    message: Record<string, unknown>,
    options: { sign?: boolean; id?: string } = {},
  ) => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ wa_id: phone, profile: { name: 'Carmen Rojas' } }],
                messages: [{ from: phone, id: options.id ?? `wamid.${randomUUID()}`, ...message }],
              },
            },
          ],
        },
      ],
    });
    const req = http().post('/api/v1/whatsapp/webhook').set('content-type', 'application/json');
    if (options.sign !== false) {
      req.set(
        'x-hub-signature-256',
        `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
      );
    }
    return req.send(body);
  };
  const say = (phone: string, text: string, id?: string) =>
    deliver(phone, { type: 'text', text: { body: text } }, { id }).expect(200);
  const tap = (phone: string, id: string) =>
    deliver(phone, {
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id, title: id } },
    }).expect(200);
  const repliesTo = (phone: string) => whatsapp.sent.filter((m) => m.to === `+${phone}`);
  const last = (phone: string) => repliesTo(phone).at(-1)!.message;

  it(
    'answers the menu, asks for a moto with its price, tells when it is taken and takes the stars',
    { timeout: 40_000 },
    async () => {
      const db = app.get(DatabaseService).db;
      const service = app.get(WhatsappService);

      // --- Meta's webhook setup and signatures.
      await http()
        .get('/api/v1/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' })
        .expect(200)
        .expect('42');
      await http()
        .get('/api/v1/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' })
        .expect(403);
      const phone = `58414${randomInt(1_000_000, 9_999_999)}`;
      await deliver(phone, { type: 'text', text: { body: 'hola' } }, { sign: false }).expect(403);
      expect(repliesTo(phone)).toHaveLength(0);

      // --- A zone with two stops and a moto line that rides between them.
      const admin = await signIn('admin');
      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({ kind: 'stop', name: `${name} ${run}`, city: 'San Félix', state: 'Bolívar' })
            .expect(201)
        ).body as Stop;
      const a = await stop('WA Plaza');
      const b = await stop('WA Hospital');
      const zone = (
        await http()
          .post('/api/v1/admin/zones')
          .set('Authorization', admin.auth)
          .send({ name: `WA ${run}`, slug: `wa-${run}`, status: 'active' })
          .expect(201)
      ).body as OperatingZone;
      for (const s of [a, b]) {
        await http()
          .patch(`/api/v1/admin/stops/${s.id}`)
          .set('Authorization', admin.auth)
          .send({ zoneId: zone.id })
          .expect(200);
      }
      const owner = await signIn();
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({
            type: 'moto_line',
            legalName: `Mototaxis WA ${run}`,
            rif: `J-${randomInt(10_000_000, 99_999_999)}-${randomInt(0, 9)}`,
          })
          .expect(201)
      ).body as { organization: { id: string } };
      await http()
        .post(`/api/v1/admin/organizations/${organization.id}/review`)
        .set('Authorization', admin.auth)
        .send({ decision: 'approve' })
        .expect(200);
      const url = `/api/v1/organizations/${organization.id}`;
      const plate = `WA${randomInt(100, 999)}AB`;
      const moto = (
        await http()
          .post(`${url}/vehicles`)
          .set('Authorization', owner.auth)
          .send({ plate })
          .expect(201)
      ).body as FleetVehicle;
      await http()
        .put(`${url}/taxi/stretch-fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [{ stopIds: [a.id, b.id], mode: 'motorcycle', amount: '2', currency: 'USD' }],
        })
        .expect(200);

      // --- The menu, by greeting; a repeated delivery is answered once.
      const hello = `wamid.${randomUUID()}`;
      await say(phone, 'Hola', hello);
      await say(phone, 'Hola', hello);
      expect(repliesTo(phone)).toHaveLength(1);
      expect(asText(last(phone))).toMatch(/Hola, Carmen.*Pedir taxi o moto/s);
      expect(asText(last(phone))).not.toMatch(/cuenta bancaria|banco/i);

      // --- Option 2: the moto step by step, with the price before asking.
      await say(phone, '2');
      if (last(phone).buttons) await tap(phone, 'mode:motorcycle');
      expect(asText(last(phone))).toMatch(/Desde qué parada/);
      await tap(phone, `stop:${a.id}`);
      expect(asText(last(phone))).toMatch(new RegExp(`${b.name}.*US\\$ 2,00`));
      await tap(phone, `stop:${b.id}`);
      expect(asText(last(phone))).toMatch(/Dónde te buscamos/);
      await deliver(phone, {
        type: 'location',
        location: { latitude: 8.35, longitude: -62.65, name: 'Panadería La Esquina' },
      }).expect(200);
      // A motorcycle carries one: no question about passengers.
      expect(asText(last(phone))).toMatch(/Revisa tu pedido.*US\$ 2,00/s);
      await tap(phone, 'taxi:yes');
      const done = asText(last(phone));
      expect(done).toMatch(/ya lo pedí/);
      const token = /https:\/\/example\.test\/es\/taxi\/([A-Za-z0-9_-]+)/.exec(done)![1]!;
      const [ride] = await db.select().from(taxiRides).where(eq(taxiRides.trackingToken, token));
      expect(ride).toMatchObject({
        channel: 'whatsapp',
        kind: 'stretch',
        mode: 'motorcycle',
        passengers: 1,
        contactPhone: `+${phone}`,
      });
      expect(ride!.address).toMatch(/Panadería La Esquina.*maps\.google\.com/);

      // --- A driver takes it: one notice with the plate and the price, sent once.
      await http()
        .post(`/api/v1/me/taxi/rides/${ride!.id}/accept`)
        .set('Authorization', owner.auth)
        .send({ organizationId: organization.id, vehicleId: moto.id })
        .expect(200);
      const before = repliesTo(phone).length;
      await service.sweep();
      await service.sweep();
      expect(repliesTo(phone)).toHaveLength(before + 1);
      expect(asText(last(phone))).toMatch(new RegExp(`va en camino.*${plate}.*US\\$ 2,00`, 's'));

      // --- Finished: the stars, answered in the chat.
      for (const step of ['pickup', 'complete']) {
        await http()
          .post(`/api/v1/me/taxi/rides/${ride!.id}/${step}`)
          .set('Authorization', owner.auth)
          .send({})
          .expect(200);
      }
      await service.sweep();
      expect(last(phone).list?.rows[0]).toMatchObject({ id: 'rate:5' });
      await tap(phone, 'rate:4');
      expect(asText(last(phone))).toMatch(/Gracias por calificar/);
      const [rated] = await db.select().from(taxiRides).where(eq(taxiRides.id, ride!.id));
      expect(rated!.rating).toBe(4);

      // --- A person takes over; the bot stays quiet until "menú".
      await say(phone, '5');
      expect(asText(last(phone))).toMatch(/Te paso con una persona.*código de tu reserva/s);
      const quiet = repliesTo(phone).length;
      await say(phone, 'Pagué ayer y no me llegó el boleto');
      expect(repliesTo(phone)).toHaveLength(quiet);
      await say(phone, 'menú');
      expect(asText(last(phone))).toMatch(/Qué necesitas/);

      // --- Outside the free 24-hour window nothing is sent: it is only logged.
      await say(phone, '2');
      if (last(phone).buttons) await tap(phone, 'mode:motorcycle');
      await tap(phone, `stop:${b.id}`);
      await tap(phone, `stop:${a.id}`);
      await say(phone, 'Calle Bolívar, frente a la plaza');
      await tap(phone, 'taxi:yes');
      const [second] = await db
        .select()
        .from(taxiRides)
        .where(and(eq(taxiRides.contactPhone, `+${phone}`), eq(taxiRides.status, 'requested')));
      await db
        .update(whatsappChats)
        .set({ lastInboundAt: new Date(Date.now() - 25 * 3_600_000) })
        .where(eq(whatsappChats.phone, `+${phone}`));
      await http()
        .post(`/api/v1/me/taxi/rides/${second!.id}/accept`)
        .set('Authorization', owner.auth)
        .send({ organizationId: organization.id, vehicleId: moto.id })
        .expect(200);
      const sentBefore = repliesTo(phone).length;
      await service.sweep();
      expect(repliesTo(phone)).toHaveLength(sentBefore);
      const [chat] = await db
        .select()
        .from(whatsappChats)
        .where(eq(whatsappChats.phone, `+${phone}`));
      const outside = await db
        .select()
        .from(whatsappMessages)
        .where(
          and(eq(whatsappMessages.chatId, chat!.id), eq(whatsappMessages.status, 'outside_window')),
        );
      expect(outside).toHaveLength(1);
    },
  );
});
