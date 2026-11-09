import { randomInt, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  todayInVenezuela,
  type AuthResponse,
  type Booking,
  type Invoice,
  type Purchase,
  type PurchasesBook,
  type Route,
  type SalesBook,
  type Stop,
} from '@vtp/shared-types';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/modules/identity/identity.schema.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';

describe.runIf(expectDatabase)('Fiscal: service-fee invoices and books (e2e)', () => {
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
          email: `fiscal-${name}-${run}@example.test`,
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
    'drafts the fee invoice with the money, issues it in bolívares and corrects it on cancellation',
    { timeout: 30_000 },
    async () => {
      const db = app.get(DatabaseService).db;
      const admin = await register('admin');
      const owner = await register('linea');
      const passenger = await register('pasajera');
      await db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, admin.user.id));
      const fiscal = '/api/v1/admin/fiscal';
      const asAdmin = (method: 'get' | 'put' | 'post' | 'patch' | 'delete', path: string) =>
        http()[method](`${fiscal}${path}`).set('Authorization', admin.auth);

      const stop = async (name: string) =>
        (
          await http()
            .post('/api/v1/admin/stops')
            .set('Authorization', admin.auth)
            .send({ kind: 'stop', name: `${name} ${run}`, city: name, state: 'Lara' })
            .expect(201)
        ).body as Stop;
      const barquisimeto = await stop('Barquisimeto');
      const carora = await stop('Carora');
      const rif = `J-${randomInt(10_000_000, 99_999_999)}-1`;
      const { organization } = (
        await http()
          .post('/api/v1/organizations')
          .set('Authorization', owner.auth)
          .send({ type: 'bus_company', legalName: `Expresos Lara ${run}`, rif })
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
        .send({ commissionRate: '15', refundTiers: null })
        .expect(200);
      const route = (
        await http()
          .post(`${org}/routes`)
          .set('Authorization', owner.auth)
          .send({
            name: `Barquisimeto – Carora ${run}`,
            stops: [
              { stopId: barquisimeto.id, minutesFromOrigin: 0 },
              { stopId: carora.id, minutesFromOrigin: 90 },
            ],
          })
          .expect(201)
      ).body as Route;
      await http()
        .put(`${org}/routes/${route.id}/fares`)
        .set('Authorization', owner.auth)
        .send({
          fares: [
            { fromStopId: barquisimeto.id, toStopId: carora.id, amount: '10.00', currency: 'USD' },
          ],
        })
        .expect(200);
      const today = todayInVenezuela();
      const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
      const { schedules } = (
        await http()
          .post(`${org}/routes/${route.id}/schedules`)
          .set('Authorization', owner.auth)
          .send({
            departureTime: '06:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            validFrom: today,
            serviceClass: 'standard',
            seats: 30,
          })
          .expect(201)
      ).body as { schedules: { id: string }[] };
      await http()
        .post(`${org}/routes/${route.id}/status`)
        .set('Authorization', owner.auth)
        .send({ status: 'active' })
        .expect(200);
      const buyAndPay = async (seat: string) => {
        const booking = (
          await http()
            .post('/api/v1/bookings')
            .set('Authorization', passenger.auth)
            .send({
              scheduleId: schedules[0]!.id,
              serviceDate: tomorrow,
              fromStopId: barquisimeto.id,
              toStopId: carora.id,
              passengers: [
                {
                  seatNumber: seat,
                  firstName: 'Ana',
                  lastName: 'Prueba',
                  documentType: 'V',
                  documentNumber: '20123456',
                },
              ],
            })
            .expect(201)
        ).body as Booking;
        const payment = (
          await http()
            .post(`/api/v1/me/bookings/${booking.id}/payments`)
            .set('Authorization', passenger.auth)
            .send({ method: 'usdt' })
            .expect(201)
        ).body as { id: string };
        await http()
          .post(`/api/v1/me/payments/${payment.id}/simulate`)
          .set('Authorization', passenger.auth)
          .send({})
          .expect(200);
        return booking;
      };
      const documentsOf = async (booking: Booking) =>
        ((await asAdmin('get', '/invoices').expect(200)).body as Invoice[])
          .filter((i) => i.bookingId === booking.id)
          .sort((a, b) => a.reason.localeCompare(b.reason));

      // --- Paying writes a draft for the fee only (1.50 of 11.50), to the first passenger.
      const first = await buyAndPay('1');
      const second = await buyAndPay('2');
      const [draft] = await documentsOf(first);
      expect(draft).toMatchObject({
        kind: 'invoice',
        reason: 'service_fee',
        status: 'draft',
        bookingCode: first.code,
        buyer: { name: 'Ana Prueba', idType: 'V', idNumber: '20123456', address: null },
        amount: '1.50',
        currency: 'USD',
        number: null,
        amountsVes: null,
      });
      await http().get(`${fiscal}/invoices`).set('Authorization', owner.auth).expect(403);

      // --- Issuing needs the fiscal details, the SENIAT numbers and a BCV rate.
      await asAdmin('put', '/settings')
        .send({
          legalName: 'X',
          rif: '123',
          fiscalAddress: 'Y',
          taxpayerType: 'ordinary',
          vatRate: '16',
        })
        .expect(400);
      await asAdmin('put', '/settings')
        .send({
          legalName: '',
          rif: '',
          fiscalAddress: '',
          taxpayerType: 'ordinary',
          vatRate: '16',
        })
        .expect(200);
      const number = `F${run}`;
      await asAdmin('post', `/invoices/${draft!.id}/issue`)
        .send({ number, controlNumber: `00-${run}` })
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('FISCAL_SETTINGS_INCOMPLETE'));
      const settings = {
        legalName: 'Inversiones Prueba, F.P.',
        rif: 'v123456789',
        fiscalAddress: 'Av. Lara, Barquisimeto',
        taxpayerType: 'ordinary',
        vatRate: '16',
      };
      expect((await asAdmin('put', '/settings').send(settings).expect(200)).body).toEqual({
        legalName: 'Inversiones Prueba, F.P.',
        rif: 'V-12345678-9',
        fiscalAddress: 'Av. Lara, Barquisimeto',
        taxpayerType: 'ordinary',
        vatRate: '16.00',
        issuer: 'draft',
        complete: true,
      });
      await asAdmin('post', `/invoices/${draft!.id}/issue`).send({}).expect(400);
      await asAdmin('post', `/invoices/${draft!.id}/issue`)
        .send({ number, controlNumber: `00-${run}`, issuedOn: '2000-01-03' })
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('BCV_RATE_MISSING'));
      await asAdmin('put', '/bcv-rates').send({ date: today, unitsPerUsd: '250' }).expect(200);

      // The buyer can still change on a draft.
      await asAdmin('patch', `/invoices/${draft!.id}/buyer`)
        .send({ name: 'Ana Prueba', idType: 'V', idNumber: '20123456', address: 'Carora, Lara' })
        .expect(200);
      const issued = (
        await asAdmin('post', `/invoices/${draft!.id}/issue`)
          .send({ number, controlNumber: `00-${run}` })
          .expect(200)
      ).body as Invoice;
      // 1.50 × 250 = 375.00 Bs, VAT included: base 375 / 1.16 = 323.28, VAT 51.72.
      expect(issued).toMatchObject({
        status: 'issued',
        number,
        controlNumber: `00-${run}`,
        issuedOn: today,
        taxpayerType: 'ordinary',
        exchangeRate: '250.000000',
        buyer: { address: 'Carora, Lara' },
        amountsVes: {
          base: '323.28',
          notTaxed: '0.00',
          vatRate: '16.00',
          vat: '51.72',
          total: '375.00',
        },
      });
      await asAdmin('post', `/invoices/${draft!.id}/issue`)
        .send({ number: `${number}b`, controlNumber: `01-${run}` })
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('INVOICE_NOT_DRAFT'));
      await asAdmin('patch', `/invoices/${draft!.id}/buyer`)
        .send({ name: 'Otra', idType: 'V', idNumber: '1234567', address: null })
        .expect(409);
      const [secondDraft] = await documentsOf(second);
      await asAdmin('post', `/invoices/${secondDraft!.id}/issue`)
        .send({ number, controlNumber: `02-${run}` })
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('INVOICE_NUMBER_TAKEN'));

      // --- The operator cancels the departure: the passenger gets the fee back.
      await http()
        .post(`${org}/dispatch/cancel`)
        .set('Authorization', owner.auth)
        .send({ scheduleId: schedules[0]!.id, serviceDate: tomorrow, reason: 'La unidad se dañó.' })
        .expect(200);
      // Issued: a credit note to the passenger, and the operator is invoiced for the fee.
      const [creditNote, operatorInvoice, original] = await documentsOf(first);
      expect(original).toMatchObject({ reason: 'service_fee', status: 'issued' });
      expect(creditNote).toMatchObject({
        kind: 'credit_note',
        reason: 'fee_refund',
        status: 'draft',
        relatedInvoice: { id: draft!.id, number },
        buyer: { name: 'Ana Prueba', address: 'Carora, Lara' },
        amount: '1.50',
      });
      expect(operatorInvoice).toMatchObject({
        kind: 'invoice',
        reason: 'operator_cancellation',
        buyer: { name: `Expresos Lara ${run}`, idType: 'J', idNumber: rif.slice(2) },
        amount: '1.50',
      });
      // Never issued: the draft is voided, and the operator is invoiced.
      const [secondOperator, secondVoided] = await documentsOf(second);
      expect(secondVoided).toMatchObject({ reason: 'service_fee', status: 'voided' });
      expect(secondOperator).toMatchObject({ reason: 'operator_cancellation', status: 'draft' });

      await asAdmin('post', `/invoices/${creditNote!.id}/issue`)
        .send({ number: `NC${run}`, controlNumber: `03-${run}` })
        .expect(200);
      // A formal taxpayer charges no VAT: everything is recorded as not taxed.
      await asAdmin('put', '/settings')
        .send({ ...settings, taxpayerType: 'formal' })
        .expect(200);
      const formal = (
        await asAdmin('post', `/invoices/${operatorInvoice!.id}/issue`)
          .send({ number: `${number}c`, controlNumber: `04-${run}` })
          .expect(200)
      ).body as Invoice;
      expect(formal.amountsVes).toEqual({
        base: '0.00',
        notTaxed: '375.00',
        vatRate: '0.00',
        vat: '0.00',
        total: '375.00',
      });
      await asAdmin('put', '/settings')
        .send({ ...settings, taxpayerType: 'ordinary' })
        .expect(200);
      await asAdmin('post', `/invoices/${secondOperator!.id}/void`)
        .send({ reason: 'Error de prueba' })
        .expect(200);
      await asAdmin('post', `/invoices/${secondOperator!.id}/void`)
        .send({ reason: 'Error de prueba' })
        .expect(409);

      // --- The sales book of the month lists the numbered documents; credit notes subtract.
      const month = today.slice(0, 7);
      const book = (await asAdmin('get', `/books/sales?month=${month}`).expect(200))
        .body as SalesBook;
      const mine = book.rows.filter((r) => r.number.endsWith(run));
      expect(mine).toEqual([
        expect.objectContaining({
          documentType: 'FAC',
          number,
          buyerId: 'V-20123456',
          total: '375.00',
          base: '323.28',
          vat: '51.72',
        }),
        expect.objectContaining({
          documentType: 'NC',
          number: `NC${run}`,
          affectedInvoice: number,
          total: '-375.00',
          base: '-323.28',
          vat: '-51.72',
        }),
      ]);
      await asAdmin('get', '/books/sales?month=2026-13').expect(400);

      // --- Purchases the platform received, for the purchases book.
      const purchaseInput = {
        date: today,
        supplierRif: 'J123456780',
        supplierName: 'Hosting Prueba, C.A.',
        invoiceNumber: `P${run}`,
        controlNumber: `00-P${run}`,
        base: '1000.00',
        exempt: '0.00',
        vatRate: '16',
        vat: '160.00',
      };
      const purchase = (await asAdmin('post', '/purchases').send(purchaseInput).expect(201))
        .body as Purchase;
      expect(purchase).toMatchObject({ supplierRif: 'J-12345678-0', total: '1160.00' });
      await asAdmin('post', '/purchases')
        .send(purchaseInput)
        .expect(409)
        .expect((res) => expect(res.body.error.reason).toBe('PURCHASE_TAKEN'));
      await asAdmin('post', '/purchases')
        .send({ ...purchaseInput, total: '5' })
        .expect(400);
      const purchases = (await asAdmin('get', `/books/purchases?month=${month}`).expect(200))
        .body as PurchasesBook;
      expect(purchases.rows.some((p) => p.id === purchase.id)).toBe(true);
      await asAdmin('delete', `/purchases/${purchase.id}`).expect(204);
      await asAdmin('delete', `/purchases/${purchase.id}`).expect(404);
    },
  );
});
